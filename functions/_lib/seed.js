import { buildCatalog, DEFAULT_SETTINGS, DEFAULT_COUPONS, DEFAULT_PINCODES } from './seed-data.js';

// Returns [{sql, params}] that (re)create all catalog/config rows.
export function seedStatements(nowIso) {
  const out = [];
  const { products, variants } = buildCatalog(nowIso);
  for (const p of products) {
    out.push({
      sql: `INSERT INTO products (id,name,tagline,description,collections,category,price,mrp,hsn,fabric,gsm,fit,care,origin,model_info,size_group,images,colours,cost_fabric,cost_labour,cost_transport,cost_duties,is_new,status,sort,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [p.id, p.name, p.tagline, p.description, JSON.stringify(p.collections), p.category, p.price, p.mrp, p.hsn, p.fabric, p.gsm, p.fit, p.care, p.origin, p.model_info, p.size_group, JSON.stringify(p.images), JSON.stringify(p.colours), p.cost_fabric, p.cost_labour, p.cost_transport, p.cost_duties, p.is_new, p.status, p.sort, p.created_at],
    });
  }
  for (const v of variants) {
    out.push({
      sql: 'INSERT INTO variants (sku,product_id,colour,size,on_hand,reserved,low_threshold) VALUES (?,?,?,?,?,?,?)',
      params: [v.sku, v.product_id, v.colour, v.size, v.on_hand, v.reserved, v.low_threshold],
    });
    if (v.on_hand > 0) {
      out.push({
        sql: "INSERT INTO stock_ledger (sku,delta,reserved_delta,reason,order_id,actor,note,ts) VALUES (?,?,0,'opening_stock',NULL,'system','Opening stock',?)",
        params: [v.sku, v.on_hand, nowIso],
      });
    }
  }
  for (const [k, val] of Object.entries(DEFAULT_SETTINGS)) {
    out.push({ sql: 'INSERT INTO settings (key,value) VALUES (?,?)', params: [k, val] });
  }
  for (const c of DEFAULT_COUPONS) {
    out.push({
      sql: 'INSERT INTO coupons (code,type,value,min_order,expires_at,max_uses,used,active) VALUES (?,?,?,?,?,?,?,?)',
      params: [c.code, c.type, c.value, c.min_order, c.expires_at, c.max_uses, c.used, c.active],
    });
  }
  for (const r of DEFAULT_PINCODES) {
    out.push({ sql: 'INSERT INTO serviceable_pincodes (pincode,city,state,cod_ok,eta_days) VALUES (?,?,?,?,?)', params: r });
  }
  return out;
}

export const RESET_TABLES = ['webhook_events', 'subscribers', 'order_events', 'payments', 'order_items', 'stock_ledger', 'orders', 'customers', 'coupons', 'variants', 'products', 'settings', 'serviceable_pincodes'];
