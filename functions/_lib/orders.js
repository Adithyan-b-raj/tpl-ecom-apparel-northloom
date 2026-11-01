import { HttpError, nowIso, newOrderId, loadSettings, num, computeQuote, couponCheck, upiLink } from './core.js';
import { GST_STATES } from './seed-data.js';

const PHONE_RE = /^[6-9]\d{9}$/;
const PIN_RE = /^[1-9]\d{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'rto'],
  delivered: ['return_requested'],
  return_requested: ['return_received', 'delivered'],
  return_received: ['refunded'],
  rto: [], cancelled: [], refunded: [],
};

const inList = (n) => Array(n).fill('?').join(',');

// ---------- lookups ----------
export async function getOrder(db, id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
}
export async function getItems(db, id) {
  const { results } = await db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(id).all();
  return results;
}
export async function getEvents(db, id) {
  const { results } = await db.prepare('SELECT ts,type,from_status,to_status,actor,note FROM order_events WHERE order_id = ? ORDER BY id').bind(id).all();
  return results;
}
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export function phoneMatches(order, phone) {
  return order && last10(order.phone) === last10(phone) && last10(phone).length === 10;
}

export function publicOrder(order, items, settings, events) {
  const o = { ...order };
  delete o.client_token;
  o.items = items;
  if (events) o.events = events.filter((e) => e.type !== 'note');
  if (order.payment_method === 'upi' && ['pending', 'utr_submitted'].includes(order.payment_status) && order.status === 'placed') {
    o.upi = {
      vpa: settings.upi_vpa, merchant: settings.upi_merchant_name, amount: (order.total / 100).toFixed(2),
      link: upiLink(settings, order), expires_at: order.expires_at,
    };
  }
  return o;
}

// ---------- guarded transition builder ----------
// Every statement is guarded by "the order is still in the state we read", so
// concurrent requests cannot double-apply stock moves. Orders row is updated last.
function guard(orderId, status, pay, extra) {
  return {
    sql: `EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = ? AND payment_status = ?${extra ? ' ' + extra.sql : ''})`,
    params: [orderId, status, pay, ...(extra ? extra.params : [])],
  };
}
const STOCK = {
  release: { reason: 'release', on: '0', res: '-qty', set: 'reserved = reserved - (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = ? AND oi.sku = variants.sku)' },
  ship: { reason: 'ship', on: '-qty', res: '-qty', set: 'on_hand = on_hand - (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = ? AND oi.sku = variants.sku), reserved = reserved - (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = ? AND oi.sku = variants.sku)', twice: true },
  restock: { reason: 'restock', on: 'qty', res: '0', set: 'on_hand = on_hand + (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = ? AND oi.sku = variants.sku)' },
};

/**
 * spec: {from, pay, to, payTo, stock, reason, actor, note, eventType, extraGuard, set:{col:val}}
 * returns true if applied, false if lost a race / state changed.
 */
export async function transition(db, order, spec) {
  const ts = nowIso();
  const g = guard(order.id, spec.from, spec.pay, spec.extraGuard);
  const st = [];
  if (spec.stock) {
    const s = STOCK[spec.stock];
    const reason = spec.reason || s.reason;
    st.push(db.prepare(`INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) SELECT sku, ${s.on}, ${s.res}, ?, order_id, ?, ?, ? FROM order_items WHERE order_id = ? AND ${g.sql}`)
      .bind(reason, spec.actor || 'system', spec.note || '', ts, order.id, ...g.params));
    const binds = s.twice ? [order.id, order.id, order.id] : [order.id, order.id];
    st.push(db.prepare(`UPDATE variants SET ${s.set} WHERE sku IN (SELECT sku FROM order_items WHERE order_id = ?) AND ${g.sql}`)
      .bind(...binds, ...g.params));
  }
  if (spec.payStatusTo || spec.payRowStatus) {
    st.push(db.prepare(`UPDATE payments SET status = ?, updated_at = ?${spec.utr ? ', utr = ?' : ''}${spec.gatewayRef ? ', gateway_ref = ?' : ''} WHERE order_id = ? AND ${g.sql}`)
      .bind(spec.payRowStatus || spec.payStatusTo, ts, ...(spec.utr ? [spec.utr] : []), ...(spec.gatewayRef ? [spec.gatewayRef] : []), order.id, ...g.params));
  }
  st.push(db.prepare(`INSERT INTO order_events (order_id,ts,type,from_status,to_status,actor,note) SELECT ?,?,?,?,?,?,? WHERE ${g.sql}`)
    .bind(order.id, ts, spec.eventType || 'status', spec.from, spec.to || spec.from, spec.actor || 'system', spec.note || '', ...g.params));
  const sets = ['updated_at = ?', 'status = ?', 'payment_status = ?'];
  const sb = [ts, spec.to || spec.from, spec.payStatusTo || spec.pay];
  for (const [k, v] of Object.entries(spec.set || {})) { sets.push(`${k} = ?`); sb.push(v); }
  st.push(db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ? AND status = ? AND payment_status = ?${spec.extraGuard ? ' ' + spec.extraGuard.sql : ''}`)
    .bind(...sb, order.id, spec.from, spec.pay, ...(spec.extraGuard ? spec.extraGuard.params : [])));
  const res = await db.batch(st);
  return (res[res.length - 1].meta.changes || 0) > 0;
}

// ---------- lazy expiry sweep (no cron) ----------
export async function sweepExpired(db) {
  const now = nowIso();
  const { results } = await db.prepare("SELECT * FROM orders WHERE payment_method = 'upi' AND payment_status = 'pending' AND status = 'placed' AND expires_at IS NOT NULL AND expires_at < ? LIMIT 25").bind(now).all();
  let n = 0;
  for (const o of results) {
    const ok = await transition(db, o, {
      from: 'placed', pay: 'pending', to: 'cancelled', payStatusTo: 'expired', stock: 'release', reason: 'expire',
      eventType: 'expired', actor: 'system', note: 'UPI payment window elapsed - stock released',
      extraGuard: { sql: 'AND expires_at < ?', params: [now] },
    });
    if (ok) n++;
  }
  return n;
}

// ---------- place order ----------
function clean(v, max = 200) { return String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max); }

export function validateCustomer(b) {
  const errors = {};
  const name = clean(b.name, 80);
  if (name.length < 2) errors.name = 'Enter your full name';
  const phone = String(b.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number';
  const email = clean(b.email, 120);
  if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  const address1 = clean(b.address1, 160);
  if (address1.length < 5) errors.address1 = 'Enter your house number and street';
  const city = clean(b.city, 60);
  if (city.length < 2) errors.city = 'Enter your city';
  const state = clean(b.state, 60);
  if (!GST_STATES.includes(state)) errors.state = 'Select your state';
  const pincode = String(b.pincode || '').trim();
  if (!PIN_RE.test(pincode)) errors.pincode = 'Enter a valid 6-digit pincode';
  return { errors, value: { name, phone, email, address1, address2: clean(b.address2, 160), city, state, pincode } };
}

export async function loadLines(db, items) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(422, 'Your bag is empty');
  if (items.length > 25) throw new HttpError(422, 'Too many different items in one order');
  const merged = new Map();
  for (const it of items) {
    const qty = Number(it.qty);
    if (!it.sku || !Number.isInteger(qty) || qty < 1 || qty > 10) throw new HttpError(422, 'Invalid item or quantity (1-10 per item)');
    merged.set(it.sku, (merged.get(it.sku) || 0) + qty);
  }
  const skus = [...merged.keys()];
  const { results } = await db.prepare(
    `SELECT v.sku, v.colour, v.size, v.on_hand, v.reserved, p.id AS product_id, p.name, p.price, p.hsn, p.status, p.images, p.colours FROM variants v JOIN products p ON p.id = v.product_id WHERE v.sku IN (${inList(skus.length)})`,
  ).bind(...skus).all();
  const by = new Map(results.map((r) => [r.sku, r]));
  const lines = [];
  for (const [sku, qty] of merged) {
    const r = by.get(sku);
    if (!r || r.status !== 'active') throw new HttpError(422, `An item in your bag is no longer available (${sku})`, { sku });
    const colours = JSON.parse(r.colours || '[]');
    const imgs = JSON.parse(r.images || '[]');
    const image = (colours.find((c) => c.name === r.colour) || {}).image || imgs[0] || '';
    lines.push({ sku, qty, unit_price: r.price, name: r.name, colour: r.colour, size: r.size, product_id: r.product_id, hsn: r.hsn, available: r.on_hand - r.reserved, image });
  }
  return lines;
}

export async function loadCoupon(db, code) {
  const c = clean(code, 40).toUpperCase();
  if (!c) return null;
  return (await db.prepare('SELECT * FROM coupons WHERE code = ?').bind(c).first()) || { code: c, active: 0 };
}

export async function pincodeInfo(db, pin) {
  if (!PIN_RE.test(String(pin))) return { pincode: String(pin), serviceable: false, cod: false, reason: 'Enter a valid 6-digit pincode' };
  const r = await db.prepare('SELECT * FROM serviceable_pincodes WHERE pincode = ?').bind(pin).first();
  if (!r) return { pincode: pin, serviceable: false, cod: false, reason: 'Sorry, we do not deliver to this pincode yet' };
  return { pincode: pin, serviceable: true, cod: !!r.cod_ok, city: r.city, state: r.state, eta_days: r.eta_days, reason: r.cod_ok ? '' : 'Cash on delivery is not available here; pay with UPI' };
}

export async function quote(db, body) {
  const settings = await loadSettings(db);
  const lines = await loadLines(db, body.items);
  const coupon = body.coupon ? await loadCoupon(db, body.coupon) : null;
  const pm = body.payment === 'cod' ? 'cod' : 'upi';
  const q = computeQuote({ lines, settings, coupon, shippingMethod: body.shipping === 'express' ? 'express' : 'standard', paymentMethod: pm, nowStr: nowIso() });
  return { settings, lines, coupon, quote: q, payment: pm };
}

export async function placeOrder(db, body) {
  await sweepExpired(db);
  const { errors, value: cust } = validateCustomer(body.customer || {});
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', { fields: errors });
  const token = clean(body.client_token, 60) || null;
  if (token) {
    const ex = await db.prepare('SELECT id FROM orders WHERE client_token = ?').bind(token).first();
    if (ex) { const o = await getOrder(db, ex.id); const s = await loadSettings(db); return { order: publicOrder(o, await getItems(db, o.id), s), duplicate: true }; }
  }
  const { settings, lines, coupon, quote: q, payment } = await quote(db, body);
  const shippingMethod = body.shipping === 'express' ? 'express' : 'standard';
  if (!['cod', 'upi'].includes(body.payment)) throw new HttpError(422, 'Choose a payment method');
  if (coupon && q.couponError) throw new HttpError(422, q.couponError, { coupon: true });

  const pin = await pincodeInfo(db, cust.pincode);
  if (!pin.serviceable) throw new HttpError(422, pin.reason, { fields: { pincode: pin.reason } });
  if (payment === 'cod') {
    if (!pin.cod) throw new HttpError(422, 'Cash on delivery is not available for this pincode. Please pay with UPI.', { code: 'COD_PINCODE' });
    if (q.total > num(settings.cod_max_order, 500000)) throw new HttpError(422, `Cash on delivery is available up to Rs ${Math.floor(num(settings.cod_max_order, 500000) / 100)}. Please pay with UPI.`, { code: 'COD_LIMIT' });
  }
  const short = lines.filter((l) => l.available < l.qty);
  if (short.length) throw stockError(short);

  const id = newOrderId();
  const ts = nowIso();
  const expiryMin = Number(settings.upi_expiry_minutes);
  const expires = payment === 'upi' ? new Date(Date.now() + (Number.isFinite(expiryMin) ? expiryMin : 30) * 60000).toISOString() : null;
  const payStatus = payment === 'cod' ? 'cod_pending' : 'pending';
  const taxMode = cust.state.toLowerCase() === String(settings.store_state).toLowerCase() ? 'intra' : 'inter';

  const st = [];
  st.push(db.prepare(`INSERT INTO orders (id,client_token,created_at,updated_at,status,payment_method,payment_status,customer_name,phone,email,address1,address2,city,state,pincode,shipping_method,subtotal,discount,coupon_code,shipping_fee,cod_fee,gst_total,tax_mode,total,expires_at) VALUES (?,?,?,?,'placed',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, token, ts, ts, payment, payStatus, cust.name, cust.phone, cust.email, cust.address1, cust.address2, cust.city, cust.state, cust.pincode, shippingMethod, q.subtotal, q.discount, q.discount && coupon ? coupon.code : '', q.shipping_fee, q.cod_fee, q.gst_total, taxMode, q.total, expires));
  for (const l of q.lines) {
    st.push(db.prepare('INSERT INTO order_items (order_id,sku,product_id,name,colour,size,qty,unit_price,gst_rate,hsn,line_total,tax,image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, l.sku, l.product_id, l.name, l.colour, l.size, l.qty, l.unit_price, l.gst_rate, l.hsn, l.line_total, l.tax, l.image));
  }
  // The CHECK (reserved <= on_hand) constraint aborts the whole batch on oversell.
  for (const l of q.lines) st.push(db.prepare('UPDATE variants SET reserved = reserved + ? WHERE sku = ?').bind(l.qty, l.sku));
  for (const l of q.lines) {
    st.push(db.prepare("INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) VALUES (?,0,?,'reserve',?,'customer','',?)").bind(l.sku, l.qty, id, ts));
  }
  if (coupon && q.discount) st.push(db.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').bind(coupon.code));
  st.push(db.prepare("INSERT INTO customers (phone,name,email,created_at) VALUES (?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name, email = CASE WHEN excluded.email <> '' THEN excluded.email ELSE customers.email END").bind(cust.phone, cust.name, cust.email, ts));
  st.push(db.prepare('INSERT INTO payments (order_id,method,amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, payment, q.total, payStatus, ts, ts));
  st.push(db.prepare("INSERT INTO order_events (order_id,ts,type,from_status,to_status,actor,note) VALUES (?,?,'placed','','placed','customer',?)").bind(id, ts, payment === 'cod' ? 'COD order placed - awaiting confirmation call' : 'UPI order placed - awaiting payment'));
  try {
    await db.batch(st);
  } catch (e) {
    // Something changed between pre-check and batch (race). Nothing was written.
    const again = await loadLines(db, body.items).catch(() => lines);
    const nowShort = again.filter((l) => l.available < l.qty);
    if (nowShort.length) throw stockError(nowShort);
    if (/UNIQUE/i.test(String(e.message)) && token) {
      const ex = await db.prepare('SELECT id FROM orders WHERE client_token = ?').bind(token).first();
      if (ex) { const o = await getOrder(db, ex.id); return { order: publicOrder(o, await getItems(db, o.id), settings), duplicate: true }; }
    }
    if (/coupon|used|CHECK/i.test(String(e.message)) && coupon) throw new HttpError(422, 'This coupon has reached its usage limit');
    throw e;
  }
  const o = await getOrder(db, id);
  return { order: publicOrder(o, await getItems(db, id), settings) };
}

function stockError(short) {
  const names = short.map((l) => `${l.name} (${l.colour}, ${l.size}) - ${l.available > 0 ? `only ${l.available} left` : 'sold out'}`);
  return new HttpError(409, `Sorry, some items just sold out: ${names.join('; ')}. Your order was not placed.`, { code: 'OUT_OF_STOCK', items: short.map((l) => ({ sku: l.sku, available: l.available })) });
}

// ---------- customer: submit UTR ----------
export async function submitUtr(db, orderId, phone, utr) {
  await sweepExpired(db);
  const order = await getOrder(db, orderId);
  if (!order || !phoneMatches(order, phone)) throw new HttpError(404, 'Order not found');
  if (order.payment_method !== 'upi') throw new HttpError(422, 'This is not a UPI order');
  const u = String(utr || '').trim();
  if (!/^\d{12}$/.test(u)) throw new HttpError(422, 'Enter the 12-digit UTR / reference number from your UPI app');
  if (order.status !== 'placed' || !['pending', 'utr_submitted'].includes(order.payment_status)) {
    throw new HttpError(409, order.payment_status === 'expired' ? 'This payment window has expired. Please place the order again.' : 'This order can no longer accept a payment reference');
  }
  const dup = await db.prepare('SELECT id FROM orders WHERE utr = ? AND id <> ?').bind(u, orderId).first();
  if (dup) throw new HttpError(409, 'This UTR has already been used on another order');
  const ok = await transition(db, order, {
    from: 'placed', pay: order.payment_status, payStatusTo: 'utr_submitted', payRowStatus: 'utr_submitted', utr: u,
    eventType: 'utr_submitted', actor: 'customer', note: `UTR ${u} submitted`, set: { utr: u },
  });
  if (!ok) throw new HttpError(409, 'Order status changed, please refresh');
  return getOrder(db, orderId);
}

// ---------- admin actions ----------
export async function adminAction(db, orderId, body, actor = 'admin') {
  await sweepExpired(db);
  const order = await getOrder(db, orderId);
  if (!order) throw new HttpError(404, 'Order not found');
  const action = String(body.action || '');
  const note = clean(body.note, 300);
  const fail = () => new HttpError(409, 'Order was changed by someone else. Refresh and retry.');

  if (action === 'note') {
    if (!note) throw new HttpError(422, 'Write a note first');
    const ts = nowIso();
    await db.batch([
      db.prepare("INSERT INTO order_events (order_id,ts,type,from_status,to_status,actor,note) VALUES (?,?,'note',?,?,?,?)").bind(orderId, ts, order.status, order.status, actor, note),
      db.prepare("UPDATE orders SET notes = CASE WHEN notes = '' THEN ? ELSE notes || char(10) || ? END, updated_at = ? WHERE id = ?").bind(note, note, ts, orderId),
    ]);
    return getOrder(db, orderId);
  }

  if (action === 'cod_confirm') {
    if (order.payment_method !== 'cod') throw new HttpError(422, 'Not a COD order');
    return statusChange(db, order, 'confirmed', body, actor, fail, 'COD confirmed with customer');
  }
  if (action === 'cod_collect') {
    if (order.payment_method !== 'cod' || order.payment_status !== 'cod_pending') throw new HttpError(422, 'No pending COD collection on this order');
    if (!['shipped', 'delivered'].includes(order.status)) throw new HttpError(422, 'Cash can be marked collected once the parcel is shipped or delivered');
    const ok = await transition(db, order, { from: order.status, pay: 'cod_pending', payStatusTo: 'cod_collected', payRowStatus: 'collected', eventType: 'cod_collected', actor, note: note || 'Cash collected on delivery' });
    if (!ok) throw fail();
    return getOrder(db, orderId);
  }
  if (action === 'upi_verify') {
    if (order.payment_method !== 'upi') throw new HttpError(422, 'Not a UPI order');
    if (order.status !== 'placed' || !['pending', 'utr_submitted'].includes(order.payment_status)) throw new HttpError(409, 'This payment cannot be verified in its current state');
    const ok = await transition(db, order, { from: 'placed', pay: order.payment_status, to: 'confirmed', payStatusTo: 'paid', payRowStatus: 'paid', eventType: 'payment_verified', actor, note: note || `UPI payment verified${order.utr ? ' (UTR ' + order.utr + ')' : ''}` });
    if (!ok) throw fail();
    return getOrder(db, orderId);
  }
  if (action === 'upi_reject') {
    if (order.payment_method !== 'upi') throw new HttpError(422, 'Not a UPI order');
    if (order.status !== 'placed' || !['pending', 'utr_submitted'].includes(order.payment_status)) throw new HttpError(409, 'This payment cannot be rejected in its current state');
    const ok = await transition(db, order, { from: 'placed', pay: order.payment_status, to: 'cancelled', payStatusTo: 'failed', payRowStatus: 'failed', stock: 'release', reason: 'payment_rejected', eventType: 'payment_rejected', actor, note: note || 'UPI payment could not be verified - order cancelled, stock released' });
    if (!ok) throw fail();
    return getOrder(db, orderId);
  }
  if (action === 'status') return statusChange(db, order, String(body.to || ''), body, actor, fail, note);
  throw new HttpError(422, 'Unknown action');
}

async function statusChange(db, order, to, body, actor, fail, note) {
  const allowed = TRANSITIONS[order.status];
  if (!allowed) throw new HttpError(422, 'Unknown order status');
  if (!allowed.includes(to)) throw new HttpError(422, `Cannot move an order from "${order.status}" to "${to}"`, { code: 'INVALID_TRANSITION' });
  const pay = order.payment_status;
  const spec = { from: order.status, pay, to, actor, note };
  if (to === 'confirmed') {
    if (order.payment_method === 'upi' && pay !== 'paid') throw new HttpError(422, 'Verify the UPI payment before confirming this order');
    spec.note = note || 'Order confirmed';
  } else if (to === 'packed') {
    spec.note = note || 'Packed';
  } else if (to === 'cancelled') {
    spec.stock = 'release'; spec.reason = 'cancel';
    spec.payStatusTo = { paid: 'refund_due', cod_pending: 'cod_cancelled', pending: 'cancelled', utr_submitted: 'cancelled' }[pay] || pay;
    spec.payRowStatus = spec.payStatusTo === 'refund_due' ? 'refund_due' : 'cancelled';
    spec.note = note || 'Order cancelled - stock released';
  } else if (to === 'shipped') {
    const courier = clean(body.courier, 60); const awb = clean(body.awb, 60);
    if (!courier || !awb) throw new HttpError(422, 'Courier and AWB are required to ship an order');
    spec.stock = 'ship'; spec.set = { courier, awb };
    spec.note = note || `Shipped via ${courier}, AWB ${awb}`;
  } else if (to === 'delivered') {
    spec.note = note || 'Delivered';
  } else if (to === 'rto') {
    spec.stock = 'restock'; spec.reason = 'rto';
    spec.payStatusTo = { paid: 'refund_due', cod_pending: 'cod_failed' }[pay] || pay;
    spec.payRowStatus = spec.payStatusTo;
    spec.note = note || 'Returned to origin - stock restocked';
  } else if (to === 'return_requested') {
    spec.note = note || 'Customer requested a return';
  } else if (to === 'return_received') {
    spec.stock = 'restock'; spec.reason = 'return_received'; spec.note = note || 'Return received - stock restocked';
  } else if (to === 'refunded') {
    if (['paid', 'cod_collected', 'refund_due'].includes(pay)) { spec.payStatusTo = 'refunded'; spec.payRowStatus = 'refunded'; }
    spec.note = note || 'Refund processed';
  }
  const ok = await transition(db, order, spec);
  if (!ok) throw fail();
  return getOrder(db, order.id);
}

// ---------- payment webhook (gateway) ----------
export async function applyGatewayPayment(db, { eventId, orderId, amountPaise, ref }) {
  const ts = nowIso();
  const ins = await db.prepare('INSERT OR IGNORE INTO webhook_events (event_id,order_id,outcome,ts) VALUES (?,?,?,?)').bind(eventId, orderId, 'received', ts).run();
  if (!(ins.meta.changes > 0)) return { status: 'duplicate' };
  const order = await getOrder(db, orderId);
  const out = async (s) => { await db.prepare('UPDATE webhook_events SET outcome = ? WHERE event_id = ?').bind(s, eventId).run(); return { status: s }; };
  if (!order) return out('unknown_order');
  if (amountPaise !== null && amountPaise !== order.total) {
    await db.prepare("INSERT INTO order_events (order_id,ts,type,from_status,to_status,actor,note) VALUES (?,?,'webhook_mismatch',?,?,'gateway',?)").bind(orderId, ts, order.status, order.status, `Gateway amount ${amountPaise} paise does not match order total ${order.total}`).run();
    return out('amount_mismatch');
  }
  if (order.payment_status === 'paid') return out('already_paid');
  if (order.status === 'placed' && ['pending', 'utr_submitted'].includes(order.payment_status) && order.payment_method === 'upi') {
    const ok = await transition(db, order, { from: 'placed', pay: order.payment_status, to: 'confirmed', payStatusTo: 'paid', payRowStatus: 'paid', gatewayRef: ref || '', eventType: 'payment_gateway', actor: 'gateway', note: `Paid via gateway ${ref || ''}`.trim() });
    return out(ok ? 'paid' : 'race_lost');
  }
  await db.prepare("INSERT INTO order_events (order_id,ts,type,from_status,to_status,actor,note) VALUES (?,?,'late_payment',?,?,'gateway',?)").bind(orderId, ts, order.status, order.status, 'Payment received after the order was cancelled/expired - manual refund or re-order needed').run();
  return out('late_payment');
}
