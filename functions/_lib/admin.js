import { HttpError, nowIso, loadSettings, num } from './core.js';
import { getOrder, getItems, getEvents, publicOrder } from './orders.js';
import { seedStatements, RESET_TABLES } from './seed.js';
import { DEFAULT_SETTINGS } from './seed-data.js';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const MONEY_KEYS = ['cod_fee', 'cod_max_order', 'free_shipping_threshold', 'shipping_standard_fee', 'shipping_express_fee', 'gst_threshold'];
const RATE_KEYS = ['gst_rate_low', 'gst_rate_high', 'gst_rate_services'];
const clean = (v, max = 200) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const slugify = (s) => clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function dashboard(db) {
  const ist = new Date(Date.now() + 330 * 60000);
  const todayIst = ist.toISOString().slice(0, 10);
  const startUtc = new Date(Date.parse(todayIst + 'T00:00:00.000Z') - 330 * 60000).toISOString();
  const live = "status NOT IN ('cancelled','rto')";
  const one = async (sql, ...b) => (await db.prepare(sql).bind(...b).first());
  const today = await one(`SELECT COUNT(*) n, COALESCE(SUM(total),0) rev FROM orders WHERE created_at >= ? AND ${live}`, startUtc);
  const pendingCod = await one("SELECT COUNT(*) n FROM orders WHERE status = 'placed' AND payment_method = 'cod'");
  const upi = await one("SELECT COUNT(*) n FROM orders WHERE payment_status = 'utr_submitted' AND status = 'placed'");
  const low = await one("SELECT COUNT(*) n FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.on_hand - v.reserved <= v.low_threshold AND v.on_hand - v.reserved > 0");
  const out = await one("SELECT COUNT(*) n FROM variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND v.on_hand - v.reserved <= 0");
  const toPack = await one("SELECT COUNT(*) n FROM orders WHERE status = 'confirmed'");
  const toShip = await one("SELECT COUNT(*) n FROM orders WHERE status = 'packed'");
  const { results: chartRows } = await db.prepare(`SELECT date(created_at, '+330 minutes') d, COUNT(*) n, COALESCE(SUM(total),0) rev FROM orders WHERE created_at >= ? AND ${live} GROUP BY d`).bind(new Date(Date.parse(todayIst + 'T00:00:00.000Z') - 330 * 60000 - 6 * 86400000).toISOString()).all();
  const map = new Map(chartRows.map((r) => [r.d, r]));
  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.parse(todayIst + 'T00:00:00.000Z') - i * 86400000).toISOString().slice(0, 10);
    const r = map.get(d);
    chart.push({ date: d, orders: r ? r.n : 0, revenue: r ? r.rev : 0 });
  }
  const { results: recent } = await db.prepare('SELECT id, customer_name, total, status, payment_method, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 6').all();
  return { today_orders: today.n, today_revenue: today.rev, pending_cod: pendingCod.n, upi_awaiting: upi.n, low_stock: low.n, out_of_stock: out.n, to_pack: toPack.n, to_ship: toShip.n, chart, recent };
}

export async function listOrders(db, q) {
  const w = []; const b = [];
  if (q.status) { w.push('o.status = ?'); b.push(q.status); }
  if (q.payment) { w.push('(o.payment_method = ? OR o.payment_status = ?)'); b.push(q.payment, q.payment); }
  if (q.from) { w.push('o.created_at >= ?'); b.push(new Date(Date.parse(q.from + 'T00:00:00.000Z') - 330 * 60000).toISOString()); }
  if (q.to) { w.push('o.created_at < ?'); b.push(new Date(Date.parse(q.to + 'T00:00:00.000Z') + 86400000 - 330 * 60000).toISOString()); }
  if (q.q) { const like = `%${clean(q.q, 60)}%`; w.push('(o.id LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ? OR o.awb LIKE ? OR o.utr LIKE ?)'); b.push(like, like, like, like, like); }
  const sql = `SELECT o.*, (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS units FROM orders o ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT 300`;
  const { results } = await db.prepare(sql).bind(...b).all();
  return results.map((r) => { const o = { ...r }; delete o.client_token; return o; });
}

export async function orderDetail(db, id) {
  const o = await getOrder(db, id);
  if (!o) throw new HttpError(404, 'Order not found');
  const settings = await loadSettings(db);
  const pubOrder = publicOrder(o, await getItems(db, id), settings, null);
  const events = await getEvents(db, id);
  const { results: payments } = await db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id').bind(id).all();
  return { ...pubOrder, events, payments, allowed: null };
}

// ---------- inventory ----------
export async function inventory(db, q) {
  const w = ['1=1']; const b = [];
  if (q.product) { w.push('v.product_id = ?'); b.push(q.product); }
  if (q.low === '1') w.push('v.on_hand - v.reserved <= v.low_threshold');
  if (q.q) { w.push('(v.sku LIKE ? OR p.name LIKE ?)'); b.push(`%${clean(q.q, 40)}%`, `%${clean(q.q, 40)}%`); }
  const { results } = await db.prepare(`SELECT v.sku, v.product_id, p.name, p.status, v.colour, v.size, v.on_hand, v.reserved, v.on_hand - v.reserved AS available, v.low_threshold FROM variants v JOIN products p ON p.id = v.product_id WHERE ${w.join(' AND ')} ORDER BY p.sort, p.name, v.colour, CASE v.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 ELSE 7 END`).bind(...b).all();
  return results;
}

export async function adjustStock(db, { sku, delta, set_to, reason, note }, actor) {
  const why = clean(reason, 40);
  if (!why) throw new HttpError(422, 'A reason is required for stock adjustments');
  const v = await db.prepare('SELECT * FROM variants WHERE sku = ?').bind(sku).first();
  if (!v) throw new HttpError(404, 'SKU not found');
  let d = delta !== undefined && delta !== null && delta !== '' ? Number(delta) : Number(set_to) - v.on_hand;
  if (!Number.isInteger(d) || d === 0) throw new HttpError(422, 'Enter a whole-number change (not zero)');
  if (v.on_hand + d < v.reserved) throw new HttpError(422, `Cannot go below the ${v.reserved} units already reserved for open orders`);
  try {
    await db.batch([
      db.prepare('UPDATE variants SET on_hand = on_hand + ? WHERE sku = ?').bind(d, sku),
      db.prepare("INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) VALUES (?,?,0,?,NULL,?,?,?)").bind(sku, d, why, actor, clean(note, 200), nowIso()),
    ]);
  } catch (e) { throw new HttpError(409, 'Stock changed meanwhile - cannot apply this adjustment'); }
  return db.prepare('SELECT sku, on_hand, reserved, on_hand - reserved AS available FROM variants WHERE sku = ?').bind(sku).first();
}

export async function receiveStock(db, items, ref, actor) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(422, 'Add at least one line');
  const st = []; const ts = nowIso();
  for (const it of items) {
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) throw new HttpError(422, 'Quantities must be whole numbers above zero');
    const v = await db.prepare('SELECT sku FROM variants WHERE sku = ?').bind(it.sku).first();
    if (!v) throw new HttpError(404, `SKU not found: ${it.sku}`);
    st.push(db.prepare('UPDATE variants SET on_hand = on_hand + ? WHERE sku = ?').bind(qty, it.sku));
    st.push(db.prepare("INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) VALUES (?,?,0,'inbound_receipt',NULL,?,?,?)").bind(it.sku, qty, actor, clean(ref, 100), ts));
  }
  await db.batch(st);
  return { ok: true, lines: items.length };
}

export async function ledger(db, q) {
  const w = ['1=1']; const b = [];
  if (q.sku) { w.push('sku = ?'); b.push(q.sku); }
  if (q.order) { w.push('order_id = ?'); b.push(q.order); }
  const { results } = await db.prepare(`SELECT * FROM stock_ledger WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ${Math.min(num(q.limit, 200), 1000)}`).bind(...b).all();
  return results;
}

export function csv(rows, cols) {
  const e = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => e(r[c])).join(','))].join('\n');
}

// ---------- products ----------
function productRow(p) {
  return { ...p, collections: JSON.parse(p.collections || '[]'), images: JSON.parse(p.images || '[]'), colours: JSON.parse(p.colours || '[]') };
}
export async function adminProducts(db) {
  const { results } = await db.prepare('SELECT * FROM products ORDER BY sort, name').all();
  const { results: vs } = await db.prepare('SELECT product_id, COUNT(*) variants, SUM(on_hand) on_hand, SUM(reserved) reserved FROM variants GROUP BY product_id').all();
  const m = new Map(vs.map((v) => [v.product_id, v]));
  return results.map((p) => ({ ...productRow(p), ...(m.get(p.id) || { variants: 0, on_hand: 0, reserved: 0 }) }));
}

function readProduct(b, partial) {
  const f = {};
  const text = (k, max = 600) => { if (b[k] !== undefined) f[k] = clean(b[k], max); };
  ['name', 'tagline', 'category', 'hsn', 'fabric', 'gsm', 'fit', 'care', 'origin', 'model_info', 'size_group'].forEach((k) => text(k, 300));
  text('description', 1500);
  const money = (k, from) => { if (b[from] !== undefined) { const n = Math.round(Number(b[from]) * 100); if (!Number.isFinite(n) || n < 0) throw new HttpError(422, `Invalid ${from}`); f[k] = n; } };
  money('price', 'price'); money('mrp', 'mrp'); money('cost_fabric', 'cost_fabric'); money('cost_labour', 'cost_labour'); money('cost_transport', 'cost_transport'); money('cost_duties', 'cost_duties');
  if (b.collections !== undefined) f.collections = JSON.stringify((Array.isArray(b.collections) ? b.collections : String(b.collections).split(',')).map((x) => clean(x, 30)).filter(Boolean));
  if (b.images !== undefined) f.images = JSON.stringify((Array.isArray(b.images) ? b.images : String(b.images).split(',')).map((x) => clean(x, 200)).filter((x) => /^(\/|https?:\/\/)/.test(x)));
  if (b.colours !== undefined) f.colours = JSON.stringify((b.colours || []).map((c) => ({ name: clean(c.name, 30), hex: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#cccccc', image: clean(c.image, 200) })).filter((c) => c.name));
  if (b.is_new !== undefined) f.is_new = b.is_new ? 1 : 0;
  if (b.sort !== undefined) f.sort = Math.round(num(b.sort, 100));
  if (b.status !== undefined) { if (!['active', 'archived'].includes(b.status)) throw new HttpError(422, 'Invalid status'); f.status = b.status; }
  if (!partial && !f.name) throw new HttpError(422, 'Product name is required');
  if (!partial && f.price === undefined) throw new HttpError(422, 'Price is required');
  return f;
}

export async function createProduct(db, b) {
  const f = readProduct(b, false);
  const id = slugify(b.id || f.name);
  if (!id) throw new HttpError(422, 'Could not derive a product id');
  if (await db.prepare('SELECT id FROM products WHERE id = ?').bind(id).first()) throw new HttpError(409, 'A product with this id already exists');
  const colours = JSON.parse(f.colours || '[]');
  if (!colours.length) { colours.push({ name: 'Default', hex: '#cccccc', image: '' }); f.colours = JSON.stringify(colours); }
  const row = {
    id, name: f.name, tagline: '', description: '', collections: '[]', category: '', price: f.price, mrp: f.price, hsn: '6205', fabric: '', gsm: '', fit: '', care: '', origin: '', model_info: '', size_group: 'tops', images: '[]',
    cost_fabric: 0, cost_labour: 0, cost_transport: 0, cost_duties: 0, is_new: 0, status: 'active', sort: 100, ...f,
  };
  const cols = Object.keys(row);
  const st = [db.prepare(`INSERT INTO products (${cols.join(',')},created_at) VALUES (${cols.map(() => '?').join(',')},?)`).bind(...cols.map((c) => row[c]), nowIso())];
  const sizes = Array.isArray(b.sizes) && b.sizes.length ? b.sizes.map((s) => clean(s, 6).toUpperCase()) : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const initial = Math.max(0, Math.floor(num(b.initial_stock, 0)));
  const prefix = (b.sku_prefix ? clean(b.sku_prefix, 10) : id.replace(/[^a-z0-9]/g, '').slice(0, 6)).toUpperCase();
  const ts = nowIso();
  for (const c of colours) for (const s of sizes) {
    const sku = `NL-${prefix}-${c.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DEF'}-${s}`;
    st.push(db.prepare('INSERT INTO variants (sku,product_id,colour,size,on_hand,reserved,low_threshold) VALUES (?,?,?,?,?,0,?)').bind(sku, id, c.name, s, initial, Math.max(0, Math.floor(num(b.low_threshold, 3)))));
    if (initial > 0) st.push(db.prepare("INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) VALUES (?,?,0,'opening_stock',NULL,'admin','New product',?)").bind(sku, initial, ts));
  }
  try { await db.batch(st); } catch (e) { throw new HttpError(409, 'Could not create product (duplicate SKU?)'); }
  return productRow(await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first());
}

export async function updateProduct(db, id, b) {
  const f = readProduct(b, true);
  const cols = Object.keys(f);
  if (!cols.length) throw new HttpError(422, 'Nothing to update');
  const r = await db.prepare(`UPDATE products SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ?`).bind(...cols.map((c) => f[c]), id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Product not found');
  return productRow(await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first());
}

export async function addVariant(db, productId, b) {
  const p = await db.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first();
  if (!p) throw new HttpError(404, 'Product not found');
  const colour = clean(b.colour, 30); const size = clean(b.size, 6).toUpperCase();
  if (!colour || !size) throw new HttpError(422, 'Colour and size are required');
  const qty = Math.max(0, Math.floor(num(b.on_hand, 0)));
  const base = (await db.prepare("SELECT sku FROM variants WHERE product_id = ? LIMIT 1").bind(productId).first());
  const prefix = base ? base.sku.split('-').slice(0, 2).join('-') : 'NL-' + productId.replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase();
  const sku = b.sku ? clean(b.sku, 40).toUpperCase() : `${prefix}-${colour.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DEF'}-${size}`;
  try {
    await db.batch([
      db.prepare('INSERT INTO variants (sku,product_id,colour,size,on_hand,reserved,low_threshold) VALUES (?,?,?,?,?,0,?)').bind(sku, productId, colour, size, qty, Math.floor(num(b.low_threshold, 3))),
      db.prepare("INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) VALUES (?,?,0,'opening_stock',NULL,'admin','Variant added',?)").bind(sku, qty, nowIso()),
    ]);
  } catch (e) { throw new HttpError(409, 'That SKU already exists'); }
  return { sku };
}

export async function setThreshold(db, sku, n) {
  const t = Math.floor(Number(n));
  if (!Number.isInteger(t) || t < 0) throw new HttpError(422, 'Invalid threshold');
  const r = await db.prepare('UPDATE variants SET low_threshold = ? WHERE sku = ?').bind(t, sku).run();
  if (!r.meta.changes) throw new HttpError(404, 'SKU not found');
  return { sku, low_threshold: t };
}

// ---------- coupons ----------
export async function listCoupons(db) { return (await db.prepare('SELECT * FROM coupons ORDER BY code').all()).results; }
export async function saveCoupon(db, b, code) {
  const c = clean(code || b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (c.length < 3) throw new HttpError(422, 'Coupon code needs at least 3 letters or digits');
  if (!['percent', 'flat'].includes(b.type)) throw new HttpError(422, 'Type must be percent or flat');
  let value = Number(b.value);
  if (b.type === 'flat') value = Math.round(value * 100);
  if (!Number.isFinite(value) || value <= 0 || (b.type === 'percent' && value > 100)) throw new HttpError(422, 'Invalid discount value');
  const min = Math.round(Number(b.min_order || 0) * 100);
  const exp = b.expires_at ? new Date(b.expires_at + (String(b.expires_at).length === 10 ? 'T23:59:59+05:30' : '')).toISOString() : null;
  if (b.expires_at && Number.isNaN(Date.parse(exp))) throw new HttpError(422, 'Invalid expiry date');
  const max = Math.max(0, Math.floor(num(b.max_uses, 0)));
  await db.prepare('INSERT INTO coupons (code,type,value,min_order,expires_at,max_uses,used,active) VALUES (?,?,?,?,?,?,0,?) ON CONFLICT(code) DO UPDATE SET type=excluded.type, value=excluded.value, min_order=excluded.min_order, expires_at=excluded.expires_at, max_uses=excluded.max_uses, active=excluded.active')
    .bind(c, b.type, value, min, exp, max, b.active === false || b.active === 0 ? 0 : 1).run();
  return db.prepare('SELECT * FROM coupons WHERE code = ?').bind(c).first();
}

// ---------- customers ----------
export async function customers(db) {
  const { results } = await db.prepare("SELECT c.phone, c.name, c.email, COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','rto') THEN o.total ELSE 0 END),0) AS spent, MAX(o.created_at) AS last_order FROM customers c LEFT JOIN orders o ON o.phone = c.phone GROUP BY c.phone ORDER BY last_order DESC").all();
  return results;
}
export async function customerOrders(db, phone) {
  return (await db.prepare('SELECT id, created_at, status, payment_method, payment_status, total FROM orders WHERE phone = ? ORDER BY created_at DESC').bind(phone).all()).results;
}

// ---------- settings / pincodes ----------
export async function saveSettings(db, b) {
  const st = [];
  for (const [k, raw] of Object.entries(b || {})) {
    if (!SETTING_KEYS.includes(k)) continue;
    let v = clean(raw, 300);
    if (MONEY_KEYS.includes(k)) { if (!/^\d+$/.test(v)) throw new HttpError(422, `${k} must be a whole number of paise`); }
    else if (RATE_KEYS.includes(k)) { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 40) throw new HttpError(422, 'GST rates must be whole numbers 0-40'); }
    else if (k === 'upi_expiry_minutes') { const n = Number(v); if (!(n >= 0.01 && n <= 1440)) throw new HttpError(422, 'UPI expiry must be between 0.01 and 1440 minutes'); }
    else if (k === 'upi_vpa') { if (!/^[\w.\-]{2,}@[A-Za-z][\w]{1,}$/.test(v)) throw new HttpError(422, 'Enter a valid UPI ID like name@bank'); }
    else if (k === 'support_phone') { v = v.replace(/\D/g, ''); }
    else if (!v) throw new HttpError(422, `${k} cannot be empty`);
    st.push(db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v));
  }
  if (st.length) await db.batch(st);
  return loadSettings(db);
}
export async function listPincodes(db) { return (await db.prepare('SELECT * FROM serviceable_pincodes ORDER BY state, city, pincode').all()).results; }
export async function savePincode(db, b) {
  const pin = String(b.pincode || '').trim();
  if (!/^[1-9]\d{5}$/.test(pin)) throw new HttpError(422, 'Pincode must be 6 digits');
  const city = clean(b.city, 60); const state = clean(b.state, 60);
  if (!city || !state) throw new HttpError(422, 'City and state are required');
  await db.prepare('INSERT INTO serviceable_pincodes (pincode,city,state,cod_ok,eta_days) VALUES (?,?,?,?,?) ON CONFLICT(pincode) DO UPDATE SET city=excluded.city, state=excluded.state, cod_ok=excluded.cod_ok, eta_days=excluded.eta_days')
    .bind(pin, city, state, b.cod_ok ? 1 : 0, Math.max(1, Math.floor(num(b.eta_days, 5)))).run();
  return { ok: true };
}
export async function deletePincode(db, pin) { await db.prepare('DELETE FROM serviceable_pincodes WHERE pincode = ?').bind(pin).run(); return { ok: true }; }

// ---------- demo reset ----------
export async function resetDemo(db) {
  await db.batch(RESET_TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)));
  await db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('stock_ledger','order_items','payments','order_events')").run().catch(() => {});
  const stmts = seedStatements(nowIso());
  for (let i = 0; i < stmts.length; i += 40) {
    await db.batch(stmts.slice(i, i + 40).map((s) => db.prepare(s.sql).bind(...s.params)));
  }
  return { ok: true, statements: stmts.length };
}
