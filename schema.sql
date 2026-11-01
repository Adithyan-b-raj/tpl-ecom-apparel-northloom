-- NORTHLOOM schema (Cloudflare D1 / SQLite). All money is integer paise.
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS subscribers;
DROP TABLE IF EXISTS order_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS stock_ledger;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS serviceable_pincodes;

CREATE TABLE products (
  id TEXT PRIMARY KEY,              -- slug
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  collections TEXT NOT NULL DEFAULT '[]',   -- JSON array
  category TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),  -- paise, GST inclusive
  mrp INTEGER NOT NULL DEFAULT 0,
  hsn TEXT NOT NULL DEFAULT '6205',
  fabric TEXT NOT NULL DEFAULT '',
  gsm TEXT NOT NULL DEFAULT '',
  fit TEXT NOT NULL DEFAULT '',
  care TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT '',
  model_info TEXT NOT NULL DEFAULT '',
  size_group TEXT NOT NULL DEFAULT 'tops',
  images TEXT NOT NULL DEFAULT '[]',        -- JSON array of paths
  colours TEXT NOT NULL DEFAULT '[]',       -- JSON [{name,hex,image}]
  cost_fabric INTEGER NOT NULL DEFAULT 0,
  cost_labour INTEGER NOT NULL DEFAULT 0,
  cost_transport INTEGER NOT NULL DEFAULT 0,
  cost_duties INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  sort INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

CREATE TABLE variants (
  sku TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  colour TEXT NOT NULL,
  size TEXT NOT NULL,
  on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  low_threshold INTEGER NOT NULL DEFAULT 3,
  CHECK (reserved <= on_hand)
);
CREATE INDEX idx_variants_product ON variants(product_id);

CREATE TABLE stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,           -- change in on_hand
  reserved_delta INTEGER NOT NULL DEFAULT 0,  -- change in reserved
  reason TEXT NOT NULL,
  order_id TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  note TEXT NOT NULL DEFAULT '',
  ts TEXT NOT NULL
);
CREATE INDEX idx_ledger_sku ON stock_ledger(sku);
CREATE INDEX idx_ledger_order ON stock_ledger(order_id);

CREATE TABLE customers (
  phone TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('percent','flat')),
  value INTEGER NOT NULL,                    -- percent (1-100) or paise
  min_order INTEGER NOT NULL DEFAULT 0,      -- paise
  expires_at TEXT,                           -- ISO or NULL
  max_uses INTEGER NOT NULL DEFAULT 0,       -- 0 = unlimited
  used INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  CHECK (max_uses = 0 OR used <= max_uses)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  client_token TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'placed',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','upi')),
  payment_status TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address1 TEXT NOT NULL,
  address2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  shipping_method TEXT NOT NULL DEFAULT 'standard',
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT NOT NULL DEFAULT '',
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  cod_fee INTEGER NOT NULL DEFAULT 0,
  gst_total INTEGER NOT NULL DEFAULT 0,
  tax_mode TEXT NOT NULL DEFAULT 'intra',
  total INTEGER NOT NULL,
  courier TEXT NOT NULL DEFAULT '',
  awb TEXT NOT NULL DEFAULT '',
  utr TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,
  size TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL,
  gst_rate INTEGER NOT NULL,
  hsn TEXT NOT NULL DEFAULT '',
  line_total INTEGER NOT NULL,   -- after coupon allocation
  tax INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_items_order ON order_items(order_id);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  utr TEXT NOT NULL DEFAULT '',
  gateway_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'system',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_events_order ON order_events(order_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE serviceable_pincodes (
  pincode TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  cod_ok INTEGER NOT NULL DEFAULT 1,
  eta_days INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  ts TEXT NOT NULL
);

CREATE TABLE subscribers (
  email TEXT PRIMARY KEY,
  ts TEXT NOT NULL
);
