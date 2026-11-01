import {
  json, HttpError, loadSettings, num, nowIso, safeEqual, hmac, toHex, b64,
  makeSession, readSession, sessionCookie,
} from '../_lib/core.js';
import {
  placeOrder, quote, pincodeInfo, loadCoupon, getOrder, getItems, getEvents, publicOrder, phoneMatches,
  submitUtr, adminAction, sweepExpired, applyGatewayPayment, TRANSITIONS,
} from '../_lib/orders.js';
import * as A from '../_lib/admin.js';
import { invoiceHTML, slipHTML } from '../_lib/invoice.js';
import { buildCatalog, DEFAULT_SETTINGS, DEFAULT_PINCODES, GST_STATES } from '../_lib/seed-data.js';
import { couponCheck, couponDiscount } from '../_lib/core.js';

const PUBLIC_SETTINGS = ['brand_name', 'brand_tagline', 'support_phone', 'support_email', 'cod_fee', 'cod_max_order', 'free_shipping_threshold', 'shipping_standard_fee', 'shipping_express_fee', 'gst_threshold', 'gst_rate_low', 'gst_rate_high', 'upi_expiry_minutes'];

// ----- storefront catalog -----
function shapeProduct(p, variants) {
  return {
    id: p.id, name: p.name, tagline: p.tagline, description: p.description, collections: JSON.parse(p.collections), category: p.category,
    price: p.price, mrp: p.mrp, hsn: p.hsn, fabric: p.fabric, gsm: p.gsm, fit: p.fit, care: p.care, origin: p.origin, model_info: p.model_info,
    size_group: p.size_group, images: JSON.parse(p.images), colours: JSON.parse(p.colours), is_new: !!p.is_new,
    cost: { fabric: p.cost_fabric, labour: p.cost_labour, transport: p.cost_transport, duties: p.cost_duties },
    variants: variants.map((v) => ({ sku: v.sku, colour: v.colour, size: v.size, available: Math.max(0, v.on_hand - v.reserved), low: v.on_hand - v.reserved <= v.low_threshold })),
  };
}
async function catalog(db, slug) {
  if (!db) {
    const { products, variants } = buildCatalog('2026-11-01T00:00:00.000Z');
    const rows = products.map((p) => ({ ...p, collections: JSON.stringify(p.collections), images: JSON.stringify(p.images), colours: JSON.stringify(p.colours), is_new: p.is_new }));
    return rows.filter((p) => !slug || p.id === slug).map((p) => shapeProduct(p, variants.filter((v) => v.product_id === p.id)));
  }
  await sweepExpired(db);
  const { results: ps } = await db.prepare(`SELECT * FROM products WHERE status = 'active' ${slug ? 'AND id = ?' : ''} ORDER BY sort, name`).bind(...(slug ? [slug] : [])).all();
  const { results: vs } = await db.prepare(`SELECT v.* FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' ${slug ? 'AND p.id = ?' : ''} ORDER BY v.rowid`).bind(...(slug ? [slug] : [])).all();
  return ps.map((p) => shapeProduct(p, vs.filter((v) => v.product_id === p.id)));
}

// ----- webhook -----
async function webhook(env, request, db) {
  const secret = env.WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Webhook secret not configured');
  const raw = await request.text();
  const sig = request.headers.get('x-webhook-signature') || request.headers.get('x-razorpay-signature') || '';
  const ts = request.headers.get('x-webhook-timestamp');
  if (!sig) throw new HttpError(401, 'Missing signature');
  const mac = await hmac(secret, ts ? ts + raw : raw);
  const expected = ts ? b64(mac) : toHex(mac);
  if (!safeEqual(sig, expected)) throw new HttpError(401, 'Invalid signature');
  if (!db) throw new HttpError(503, 'Persistence not configured');
  let p; try { p = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON'); }
  // normalise Cashfree-style and simple payloads
  let orderId; let status; let amount = null; let ref; let eventId;
  if (p.data && p.data.order) {
    orderId = p.data.order.order_id; status = (p.data.payment || {}).payment_status;
    amount = (p.data.payment || {}).payment_amount ?? p.data.order.order_amount;
    ref = String((p.data.payment || {}).cf_payment_id || ''); eventId = p.event_id || `${orderId}:${ref}`;
  } else {
    orderId = p.order_id; status = p.status; amount = p.amount ?? null; ref = p.reference || p.payment_id || '';
    eventId = p.event_id || `${orderId}:${ref}`;
  }
  if (!orderId || !eventId) throw new HttpError(400, 'order_id and event id required');
  if (!['SUCCESS', 'PAID', 'CAPTURED', 'paid', 'success', 'captured'].includes(String(status))) return json({ ok: true, status: 'ignored' });
  const amountPaise = amount === null || amount === undefined ? null : Math.round(Number(amount) * 100);
  const r = await applyGatewayPayment(db, { eventId: String(eventId), orderId: String(orderId), amountPaise, ref });
  return json({ ok: true, ...r });
}

// ----- admin auth gate -----
async function requireAdmin(env, request) {
  const s = await readSession(env, request);
  if (!s) throw new HttpError(401, 'Sign in required');
  return s;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const seg = path.split('/');
  const method = request.method;
  const db = env.DB || null;
  const need = () => { if (!db) throw new HttpError(503, 'Persistence is not configured (no D1 binding). Storefront browsing works in demo fallback mode only.'); return db; };
  const body = async () => { try { return await request.json(); } catch { throw new HttpError(400, 'Invalid JSON body'); } };
  try {
    // ---------- public ----------
    if (path === 'config' && method === 'GET') {
      const s = db ? await loadSettings(db) : DEFAULT_SETTINGS;
      const pub = {}; PUBLIC_SETTINGS.forEach((k) => { pub[k] = s[k]; });
      return json({ settings: pub, demo: env.DEMO_MODE === '1', persistence: db ? 'd1' : 'memory-fallback', states: GST_STATES });
    }
    if (path === 'products' && method === 'GET') return json({ products: await catalog(db) });
    if (seg[0] === 'products' && seg.length === 2 && method === 'GET') {
      const [p] = await catalog(db, seg[1]);
      if (!p) throw new HttpError(404, 'Product not found');
      return json({ product: p });
    }
    if (seg[0] === 'pincode' && seg.length === 2 && method === 'GET') {
      if (!db) {
        const r = DEFAULT_PINCODES.find((x) => x[0] === seg[1]);
        return json(r ? { pincode: seg[1], serviceable: true, cod: !!r[3], city: r[1], state: r[2], eta_days: r[4] } : { pincode: seg[1], serviceable: false, cod: false, reason: 'Sorry, we do not deliver to this pincode yet' });
      }
      return json(await pincodeInfo(db, seg[1]));
    }
    if (path === 'quote' && method === 'POST') {
      const b = await body(); need();
      const q = await quote(db, b);
      let pin = null;
      if (b.pincode) pin = await pincodeInfo(db, String(b.pincode));
      const { lines, quote: qq, coupon } = q;
      return json({
        lines: qq.lines.map((l, i) => ({ sku: l.sku, product_id: l.product_id, name: l.name, colour: l.colour, size: l.size, qty: l.qty, unit_price: l.unit_price, gst_rate: l.gst_rate, line_total: l.line_total, tax: l.tax, available: lines[i].available, image: lines[i].image })),
        subtotal: qq.subtotal, discount: qq.discount, coupon_error: b.coupon ? qq.couponError : null, coupon: coupon && !qq.couponError ? coupon.code : null,
        shipping_fee: qq.shipping_fee, cod_fee: qq.cod_fee, gst_total: qq.gst_total, total: qq.total, pincode: pin,
        cod_allowed: !!(pin && pin.cod) && qq.total <= num(q.settings.cod_max_order, 500000),
      });
    }
    if (path === 'coupon/validate' && method === 'POST') {
      const b = await body(); need();
      const c = await loadCoupon(db, b.code);
      if (!c) throw new HttpError(422, 'Enter a coupon code');
      const sub = Number(b.subtotal) || 0;
      const err = couponCheck(c, sub, nowIso());
      if (err) throw new HttpError(422, err);
      return json({ ok: true, code: c.code, type: c.type, value: c.value, discount: couponDiscount(c, sub) });
    }
    if (path === 'orders' && method === 'POST') { need(); const r = await placeOrder(db, await body()); return json(r, r.duplicate ? 200 : 201); }
    if (seg[0] === 'orders' && seg.length >= 2 && method !== 'POST' || (seg[0] === 'orders' && seg[2] === 'utr' && method === 'POST')) {
      need();
      await sweepExpired(db);
      const id = seg[1];
      const phone = url.searchParams.get('phone') || '';
      if (seg[2] === 'utr') {
        const b = await body();
        const o = await submitUtr(db, id, b.phone, b.utr);
        return json({ ok: true, order: publicOrder(o, await getItems(db, id), await loadSettings(db)) });
      }
      const o = await getOrder(db, id);
      if (!o || !phoneMatches(o, phone)) throw new HttpError(404, 'We could not find an order with that number and phone');
      const settings = await loadSettings(db);
      if (seg[2] === 'invoice') {
        if (['cancelled'].includes(o.status)) throw new HttpError(409, 'Invoice is not available for a cancelled order');
        const html = invoiceHTML(o, await getItems(db, id), settings);
        const dl = url.searchParams.get('download') === '1';
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...(dl ? { 'content-disposition': `attachment; filename="invoice-${id}.html"` } : {}) } });
      }
      if (seg.length === 2) return json({ order: publicOrder(o, await getItems(db, id), settings, await getEvents(db, id)) });
    }
    if (path === 'newsletter' && method === 'POST') {
      need(); const b = await body();
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(422, 'Enter a valid email address');
      await db.prepare('INSERT OR IGNORE INTO subscribers (email, ts) VALUES (?, ?)').bind(email, nowIso()).run();
      return json({ ok: true });
    }
    if (path === 'payments/webhook' && method === 'POST') return await webhook(env, request, db);

    // ---------- admin ----------
    if (seg[0] === 'admin') {
      if (seg[1] === 'login' && method === 'POST') {
        const b = await body();
        const pw = String(b.password || '');
        const demo = env.DEMO_MODE === '1';
        const okMain = !!env.ADMIN_PASSWORD && safeEqual(pw, env.ADMIN_PASSWORD);
        const okDemo = demo && safeEqual(pw, 'northloom-demo');
        if (!okMain && !okDemo) throw new HttpError(401, 'Incorrect password');
        const token = await makeSession(env);
        return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, request) });
      }
      if (seg[1] === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', request, 0) });
      await requireAdmin(env, request);
      need();
      await sweepExpired(db);
      const q = Object.fromEntries(url.searchParams);
      const actor = 'admin';
      if (seg[1] === 'me') return json({ ok: true, demo: env.DEMO_MODE === '1', transitions: TRANSITIONS });
      if (seg[1] === 'dashboard') return json(await A.dashboard(db));
      if (seg[1] === 'orders') {
        if (seg.length === 2 && method === 'GET') return json({ orders: await A.listOrders(db, q) });
        const id = seg[2];
        if (seg.length === 3 && method === 'GET') return json({ order: await A.orderDetail(db, id) });
        if (seg[3] === 'action' && method === 'POST') { await adminAction(db, id, await body(), actor); return json({ order: await A.orderDetail(db, id) }); }
        if (seg[3] === 'invoice' || seg[3] === 'slip') {
          const o = await getOrder(db, id);
          if (!o) throw new HttpError(404, 'Order not found');
          const s = await loadSettings(db); const items = await getItems(db, id);
          return new Response(seg[3] === 'slip' ? slipHTML(o, items, s) : invoiceHTML(o, items, s), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
        }
      }
      if (seg[1] === 'inventory') {
        if (seg.length === 2 && method === 'GET') return json({ variants: await A.inventory(db, q) });
        if (seg[2] === 'export.csv') {
          const rows = await A.inventory(db, q);
          return new Response(A.csv(rows, ['sku', 'name', 'colour', 'size', 'on_hand', 'reserved', 'available', 'low_threshold']), { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="northloom-inventory.csv"' } });
        }
        if (seg[2] === 'adjust' && method === 'POST') return json(await A.adjustStock(db, await body(), actor));
        if (seg[2] === 'receive' && method === 'POST') { const b = await body(); return json(await A.receiveStock(db, b.items, b.reference, actor)); }
        if (seg[2] === 'threshold' && method === 'POST') { const b = await body(); return json(await A.setThreshold(db, b.sku, b.low_threshold)); }
      }
      if (seg[1] === 'ledger' && method === 'GET') {
        const rows = await A.ledger(db, q);
        if (seg[2] === 'export.csv') return new Response(A.csv(rows, ['id', 'ts', 'sku', 'delta', 'reserved_delta', 'reason', 'order_id', 'actor', 'note']), { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="northloom-stock-ledger.csv"' } });
        return json({ ledger: rows });
      }
      if (seg[1] === 'products') {
        if (seg.length === 2 && method === 'GET') return json({ products: await A.adminProducts(db) });
        if (seg.length === 2 && method === 'POST') return json({ product: await A.createProduct(db, await body()) }, 201);
        if (seg.length === 3 && method === 'PUT') return json({ product: await A.updateProduct(db, seg[2], await body()) });
        if (seg[3] === 'variants' && method === 'POST') return json(await A.addVariant(db, seg[2], await body()), 201);
      }
      if (seg[1] === 'coupons') {
        if (method === 'GET') return json({ coupons: await A.listCoupons(db) });
        if (method === 'POST' || method === 'PUT') return json({ coupon: await A.saveCoupon(db, await body(), seg[2]) });
        if (method === 'DELETE' && seg[2]) { await db.prepare('UPDATE coupons SET active = 0 WHERE code = ?').bind(seg[2]).run(); return json({ ok: true }); }
      }
      if (seg[1] === 'customers') {
        if (seg.length === 2) return json({ customers: await A.customers(db) });
        return json({ orders: await A.customerOrders(db, seg[2]) });
      }
      if (seg[1] === 'settings') {
        if (method === 'GET') return json({ settings: await loadSettings(db), states: GST_STATES });
        if (method === 'PUT') return json({ settings: await A.saveSettings(db, await body()) });
      }
      if (seg[1] === 'pincodes') {
        if (method === 'GET') return json({ pincodes: await A.listPincodes(db) });
        if (method === 'POST') return json(await A.savePincode(db, await body()));
        if (method === 'DELETE' && seg[2]) return json(await A.deletePincode(db, seg[2]));
      }
      if (seg[1] === 'reset-demo' && method === 'POST') {
        if (env.DEMO_MODE !== '1') throw new HttpError(403, 'Demo reset is only available in demo mode');
        return json(await A.resetDemo(db));
      }
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error(e && e.stack || e);
    return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
  }
}
