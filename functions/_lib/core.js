// Core helpers: responses, time, money/GST maths, HMAC sessions, settings.
// Never call Date.now() at module top-level (Workers snapshot freezes it).

export const nowIso = () => new Date().toISOString();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const enc = new TextEncoder();

export function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}
// constant-time string compare (length leak only)
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function randomId(len = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => chars[n % chars.length]).join('');
}
export function newOrderId() {
  const d = new Date();
  const ymd = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  return `NL${ymd}-${randomId(5)}`;
}

// ---------- sessions (stateless HMAC cookie) ----------
export const COOKIE = 'nl_admin';
const SESSION_TTL_S = 8 * 3600;

export async function makeSession(env) {
  if (!env.SESSION_SECRET) throw new HttpError(503, 'SESSION_SECRET is not configured');
  const payload = b64url(enc.encode(JSON.stringify({ role: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S })));
  const sig = b64url(await hmac(env.SESSION_SECRET, payload));
  return `${payload}.${sig}`;
}
export async function readSession(env, request) {
  if (!env.SESSION_SECRET) return null;
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)nl_admin=([^;]+)/);
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  const expect = b64url(await hmac(env.SESSION_SECRET, payload));
  if (!safeEqual(sig, expect)) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (data.role !== 'admin' || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}
export function sessionCookie(value, request, maxAge = SESSION_TTL_S) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// ---------- settings ----------
export async function loadSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of results) s[r.key] = r.value;
  return s;
}
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ---------- money ----------
// tax contained in a GST-inclusive amount
export const taxIn = (gross, rate) => gross - Math.round((gross * 100) / (100 + rate));

export function couponCheck(c, subtotal, nowStr) {
  if (!c || !c.active) return 'Coupon code is not valid';
  if (c.expires_at && c.expires_at < nowStr) return 'This coupon has expired';
  if (c.max_uses && c.used >= c.max_uses) return 'This coupon has reached its usage limit';
  if (subtotal < c.min_order) return `Add items worth Rs ${Math.ceil((c.min_order - subtotal) / 100)} more to use this coupon`;
  return null;
}
export function couponDiscount(c, subtotal) {
  if (c.type === 'percent') return Math.floor((subtotal * c.value) / 100);
  return Math.min(c.value, subtotal);
}

/**
 * Pure quote calculator.
 * lines: [{unit_price (paise, GST-inclusive), qty}]
 * Returns per-line tax and order totals. GST on goods is determined by the
 * unit price (<= gst_threshold -> low rate else high rate), computed on the
 * discounted line value. Shipping / COD fee are 18% (services) inclusive.
 */
export function computeQuote({ lines, settings, coupon, shippingMethod, paymentMethod, nowStr }) {
  const threshold = num(settings.gst_threshold, 250000);
  const low = num(settings.gst_rate_low, 5);
  const high = num(settings.gst_rate_high, 18);
  const svc = num(settings.gst_rate_services, 18);
  const subtotal = lines.reduce((a, l) => a + l.unit_price * l.qty, 0);
  let discount = 0; let couponError = null;
  if (coupon) {
    couponError = couponCheck(coupon, subtotal, nowStr);
    if (!couponError) discount = couponDiscount(coupon, subtotal);
  }
  // allocate discount proportionally; remainder to the last line
  let allocated = 0;
  const out = lines.map((l, i) => {
    const gross = l.unit_price * l.qty;
    let share = i === lines.length - 1 ? discount - allocated : Math.floor((discount * gross) / (subtotal || 1));
    share = Math.min(share, gross);
    allocated += share;
    const net = gross - share;
    const rate = l.unit_price <= threshold ? low : high;
    return { ...l, gst_rate: rate, line_total: net, tax: taxIn(net, rate) };
  });
  const netGoods = subtotal - discount;
  const freeAt = num(settings.free_shipping_threshold, 199900);
  const stdFee = num(settings.shipping_standard_fee, 7900);
  const expFee = num(settings.shipping_express_fee, 14900);
  let shipping_fee = shippingMethod === 'express' ? expFee : (netGoods >= freeAt ? 0 : stdFee);
  const cod_fee = paymentMethod === 'cod' ? num(settings.cod_fee, 4900) : 0;
  const services = shipping_fee + cod_fee;
  const gst_total = out.reduce((a, l) => a + l.tax, 0) + taxIn(shipping_fee, svc) + taxIn(cod_fee, svc);
  const total = netGoods + services;
  return { lines: out, subtotal, discount, couponError, shipping_fee, cod_fee, gst_total, total, goods_net: netGoods, service_tax: taxIn(services, svc) };
}

export function upiLink(settings, order) {
  const q = (v) => encodeURIComponent(v);
  const am = (order.total / 100).toFixed(2);
  return `upi://pay?pa=${q(settings.upi_vpa)}&pn=${q(settings.upi_merchant_name || settings.brand_name)}&am=${am}&tn=${q(order.id)}&cu=INR`;
}
