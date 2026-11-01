// Single source of truth for demo catalog, settings, coupons, pincodes.
// Used by: scripts/gen-seed.mjs (-> seed.sql), "Reset demo data" admin action,
// and the read-only in-memory fallback store (no DB binding).
// NOTE: no top-level Date.now()/new Date() - Workers snapshots would freeze it.

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const P = (n) => Math.round(n * 100); // rupees -> paise

// ratios of price for the transparency block (rest = GST + margin)
function cost(price, r) {
  return {
    cost_fabric: Math.round(price * r[0]),
    cost_labour: Math.round(price * r[1]),
    cost_transport: Math.round(price * r[2]),
    cost_duties: Math.round(price * r[3]),
  };
}

const SIZE_NOTE = 'Rohan is 6\'0" (183 cm) and wears size M. ';
const FEM_NOTE = 'Anika is 5\'7" (170 cm), 84-66-90 cm, and wears size S. ';

const P_LIST = [
  {
    id: 'linen-shirt', sku: 'LSH', name: 'Everyday Linen Shirt', price: 2499, mrp: 2999,
    tagline: 'Washed European flax, cut for warm days.',
    description: 'The shirt we wear most. Stone-washed 100% European flax linen that is soft from the first wear, with a relaxed collar, mother-of-pearl effect buttons and a slightly longer back hem so it sits well tucked or loose.',
    collections: ['Men', 'New'], category: 'Shirts', hsn: '6205', size_group: 'tops',
    fabric: '100% European flax linen, stone washed', gsm: '150 GSM', fit: 'Relaxed regular fit. Take your usual size; size down for a closer fit.',
    care: 'Machine wash cold, gentle cycle. Line dry in shade. Warm iron while damp. Do not tumble dry.',
    origin: 'Woven in Belgium and Lithuania, cut and stitched in Tiruppur, Tamil Nadu.',
    model_info: SIZE_NOTE + 'Chest 98 cm, waist 82 cm.', is_new: 1, sort: 1,
    colours: [
      { name: 'Sand', hex: '#D9CBB0', image: '/img/products/linen-shirt-1.jpg' },
      { name: 'Sage', hex: '#9AA58B', image: '/img/products/linen-shirt-sage.jpg' },
      { name: 'White', hex: '#F4F1EA', image: '/img/products/linen-shirt-white.jpg' },
    ],
    images: ['/img/products/linen-shirt-1.jpg', '/img/products/linen-shirt-2.jpg'],
    ratios: [0.34, 0.2, 0.05, 0.07],
  },
  {
    id: 'organic-tee', sku: 'OTE', name: 'Heavyweight Organic Tee', price: 1299, mrp: 1499,
    tagline: '240 GSM GOTS-certified cotton. Holds its shape.',
    description: 'A proper everyday tee: dense 240 GSM single-jersey from GOTS-certified organic cotton, a ribbed crew neck that does not stretch out, and a boxy but not oversized body. Pre-shrunk and garment-dyed.',
    collections: ['Women', 'Men', 'Basics'], category: 'T-shirts', hsn: '6109', size_group: 'tops',
    fabric: '100% GOTS-certified organic cotton single jersey', gsm: '240 GSM', fit: 'Boxy regular fit with a dropped shoulder. True to size.',
    care: 'Machine wash cold inside out. Tumble dry low or line dry. Do not bleach.',
    origin: 'Grown in Maharashtra, knitted and sewn in Tiruppur, Tamil Nadu.',
    model_info: FEM_NOTE + 'Wears size S for a fitted look, M for relaxed.', is_new: 0, sort: 2,
    colours: [
      { name: 'Off-white', hex: '#F1ECE1', image: '/img/products/organic-tee-1.jpg' },
      { name: 'Black', hex: '#1B1A17', image: '/img/products/organic-tee-black.jpg' },
      { name: 'Clay', hex: '#B8876B', image: '/img/products/organic-tee-clay.jpg' },
    ],
    images: ['/img/products/organic-tee-1.jpg', '/img/products/organic-tee-2.jpg'],
    ratios: [0.33, 0.19, 0.05, 0.06],
  },
  {
    id: 'pique-polo', sku: 'PPO', name: 'Piqué Knit Polo', price: 1799, mrp: 2099,
    tagline: 'Textured organic piqué, a quieter kind of polo.',
    description: 'A two-button polo in breathable organic cotton piqué with a soft knit collar that stays flat. Wear it with the pleated chino for work or with shorts on a weekend.',
    collections: ['Men', 'Basics'], category: 'Polos', hsn: '6105', size_group: 'tops',
    fabric: '100% organic cotton piqué', gsm: '210 GSM', fit: 'Regular fit, slightly tapered through the waist.',
    care: 'Machine wash cold. Dry flat or tumble dry low. Cool iron.',
    origin: 'Knitted and made in Tiruppur, Tamil Nadu.',
    model_info: SIZE_NOTE + 'Chest 98 cm.', is_new: 0, sort: 3,
    colours: [{ name: 'Forest', hex: '#34483A', image: '/img/products/pique-polo-1.jpg' }],
    images: ['/img/products/pique-polo-1.jpg', '/img/products/pique-polo-2.jpg'],
    ratios: [0.32, 0.2, 0.05, 0.07],
  },
  {
    id: 'pleated-chino', sku: 'PCH', name: 'Relaxed Pleated Chino', price: 2799, mrp: 3299,
    tagline: 'Single pleat, easy leg, stone-washed twill.',
    description: 'A relaxed pleated chino in a soft stone-washed cotton twill. High enough rise to sit comfortably, a single forward pleat for room and a gently tapered leg that does not bunch at the shoe.',
    collections: ['Men'], category: 'Trousers', hsn: '6203', size_group: 'bottoms',
    fabric: '98% cotton, 2% elastane twill', gsm: '260 GSM', fit: 'Relaxed through the thigh, tapered below the knee. True to size.',
    care: 'Machine wash cold. Tumble dry low. Warm iron if needed.',
    origin: 'Woven in Gujarat, stitched in Bengaluru, Karnataka.',
    model_info: SIZE_NOTE + 'Waist 82 cm, wears size M (32).', is_new: 0, sort: 4,
    colours: [{ name: 'Stone', hex: '#C8BBA3', image: '/img/products/pleated-chino-1.jpg' }],
    images: ['/img/products/pleated-chino-1.jpg', '/img/products/pleated-chino-2.jpg'],
    ratios: [0.3, 0.22, 0.05, 0.07],
  },
  {
    id: 'linen-trouser', sku: 'LTR', name: 'Drawstring Linen Trouser', price: 2299, mrp: 2699,
    tagline: 'Wide leg, soft waist, nothing to fuss over.',
    description: 'A wide-leg trouser with an elasticated, drawstring waist and deep side pockets. Midweight washed linen that drapes instead of clinging, and softens with every wash.',
    collections: ['Women', 'New'], category: 'Trousers', hsn: '6204', size_group: 'bottoms',
    fabric: '100% washed linen', gsm: '170 GSM', fit: 'Relaxed, high waist, wide leg. Full length 98 cm on size M.',
    care: 'Machine wash cold, gentle. Line dry. Iron warm while damp.',
    origin: 'Linen from Belgium, made in Kochi, Kerala.',
    model_info: FEM_NOTE + 'Waist 66 cm, wears size S.', is_new: 1, sort: 5,
    colours: [{ name: 'Sage', hex: '#9AA58B', image: '/img/products/linen-trouser-1.jpg' }],
    images: ['/img/products/linen-trouser-1.jpg', '/img/products/linen-trouser-2.jpg'],
    ratios: [0.34, 0.21, 0.05, 0.07],
  },
  {
    id: 'wrap-midi-dress', sku: 'WMD', name: 'Cotton Wrap Midi Dress', price: 3199, mrp: 3799,
    tagline: 'A tie-waist wrap in soft handloom-feel cotton.',
    description: 'An easy wrap dress in breathable cotton poplin with a self-tie waist, flutter-free sleeves and a calf-skimming hem. Adjustable at the waist, so it fits across the day.',
    collections: ['Women', 'New'], category: 'Dresses', hsn: '6204', size_group: 'dress',
    fabric: '100% cotton poplin, garment dyed', gsm: '130 GSM', fit: 'Wrap closure, true to size, adjustable waist. Length 118 cm on size M.',
    care: 'Machine wash cold. Line dry. Warm iron on reverse.',
    origin: 'Cut and sewn in Jaipur, Rajasthan using Indian cotton.',
    model_info: FEM_NOTE + 'Wears size S.', is_new: 1, sort: 6,
    colours: [{ name: 'Clay', hex: '#B8876B', image: '/img/products/wrap-midi-dress-1.jpg' }],
    images: ['/img/products/wrap-midi-dress-1.jpg', '/img/products/wrap-midi-dress-2.jpg'],
    ratios: [0.33, 0.23, 0.05, 0.06],
  },
  {
    id: 'kurta-shirt', sku: 'KSH', name: 'Mandarin Kurta Shirt', price: 1999, mrp: 2399,
    tagline: 'A short kurta, cut like a shirt. No embroidery.',
    description: 'A short kurta in lightweight cotton with a mandarin collar, concealed placket and side vents. Works over jeans, chinos or with a pyjama at home. Plain, with no embroidery or print.',
    collections: ['Men', 'New'], category: 'Shirts', hsn: '6205', size_group: 'tops',
    fabric: '100% cotton, mill-washed', gsm: '140 GSM', fit: 'Regular fit, hip length with side vents. True to size.',
    care: 'Machine wash cold. Line dry. Medium iron.',
    origin: 'Handloom-feel cotton from Salem, made in Erode, Tamil Nadu.',
    model_info: SIZE_NOTE + 'Wears size M.', is_new: 1, sort: 7,
    colours: [{ name: 'Off-white', hex: '#F1ECE1', image: '/img/products/kurta-shirt-1.jpg' }],
    images: ['/img/products/kurta-shirt-1.jpg', '/img/products/kurta-shirt-2.jpg'],
    ratios: [0.31, 0.23, 0.05, 0.06],
  },
  {
    id: 'overshirt', sku: 'OSH', name: 'Brushed Cotton Overshirt', price: 3499, mrp: 4199,
    tagline: 'A light layer with a soft, brushed hand.',
    description: 'An overshirt in brushed cotton twill with a chest pocket and a stitched-in-place collar. Heavy enough to wear as a light jacket, soft enough to sleep in. Button it up or wear it open.',
    collections: ['Men', 'New'], category: 'Outerwear', hsn: '6201', size_group: 'tops',
    fabric: '100% brushed organic cotton twill', gsm: '280 GSM', fit: 'Relaxed, layer-friendly. Take your usual size.',
    care: 'Machine wash cold, gentle. Dry flat. Cool iron.',
    origin: 'Woven in Erode, finished and stitched in Tiruppur, Tamil Nadu.',
    model_info: SIZE_NOTE + 'Wears size M.', is_new: 1, sort: 8,
    colours: [{ name: 'Olive', hex: '#4F5638', image: '/img/products/overshirt-1.jpg' }],
    images: ['/img/products/overshirt-1.jpg', '/img/products/overshirt-2.jpg'],
    ratios: [0.33, 0.22, 0.05, 0.07],
  },
  {
    id: 'oversized-hoodie', sku: 'OHD', name: 'Oversized French Terry Hoodie', price: 2999, mrp: 3499,
    tagline: 'Loopback terry, 340 GSM, made to be lived in.',
    description: 'A heavyweight hoodie in loopback french terry with a double-layered hood, a kangaroo pocket and a roomy, dropped-shoulder cut. Brushed on the inside for warmth without bulk.',
    collections: ['Women', 'Basics'], category: 'Hoodies', hsn: '6110', size_group: 'tops',
    fabric: '100% organic cotton french terry', gsm: '340 GSM', fit: 'Oversized. Size down for a regular fit.',
    care: 'Machine wash cold inside out. Dry flat or tumble dry low.',
    origin: 'Knitted and sewn in Tiruppur, Tamil Nadu.',
    model_info: FEM_NOTE + 'Wears size S for an oversized look.', is_new: 0, sort: 9,
    colours: [{ name: 'Warm grey', hex: '#B5ADA2', image: '/img/products/oversized-hoodie-1.jpg' }],
    images: ['/img/products/oversized-hoodie-1.jpg', '/img/products/oversized-hoodie-2.jpg'],
    ratios: [0.35, 0.2, 0.05, 0.06],
  },
  {
    id: 'linen-shorts', sku: 'LSS', name: 'Linen Blend Shorts', price: 1499, mrp: 1799,
    tagline: 'Mid-thigh, elastic back waist, built for summer.',
    description: 'Easy shorts in a linen-cotton blend with a flat front, elasticated back waist and two deep pockets. A 7-inch inseam that sits at mid-thigh.',
    collections: ['Men', 'Basics'], category: 'Shorts', hsn: '6203', size_group: 'bottoms',
    fabric: '55% linen, 45% organic cotton', gsm: '160 GSM', fit: 'Regular fit with a 7 in inseam. True to size.',
    care: 'Machine wash cold. Line dry. Iron warm.',
    origin: 'Made in Kochi, Kerala.',
    model_info: SIZE_NOTE + 'Waist 82 cm, wears size M.', is_new: 0, sort: 10,
    colours: [{ name: 'Navy', hex: '#26324A', image: '/img/products/linen-shorts-1.jpg' }],
    images: ['/img/products/linen-shorts-1.jpg', '/img/products/linen-shorts-2.jpg'],
    ratios: [0.3, 0.2, 0.05, 0.07],
  },
  {
    id: 'ribbed-tank', sku: 'RTK', name: 'Ribbed Cotton Tank', price: 899, mrp: 1099,
    tagline: 'A 2x2 rib that stays close and stays put.',
    description: 'A close-fitting tank in a stretchy 2x2 organic cotton rib with a scooped neck. Made to layer under the linen shirt or wear alone.',
    collections: ['Women', 'Basics'], category: 'Tops', hsn: '6109', size_group: 'tops',
    fabric: '95% organic cotton, 5% elastane rib', gsm: '200 GSM', fit: 'Close fit, cropped at the waist. Size up for a looser fit.',
    care: 'Machine wash cold. Line dry. Do not iron the rib.',
    origin: 'Knitted and sewn in Tiruppur, Tamil Nadu.',
    model_info: FEM_NOTE + 'Wears size S.', is_new: 0, sort: 11,
    colours: [{ name: 'Off-white', hex: '#F1ECE1', image: '/img/products/ribbed-tank-1.jpg' }],
    images: ['/img/products/ribbed-tank-1.jpg', '/img/products/ribbed-tank-2.jpg'],
    ratios: [0.3, 0.2, 0.05, 0.06],
  },
  {
    id: 'canvas-tote', sku: 'CTB', name: 'Everyday Canvas Tote', price: 999, mrp: 1199,
    tagline: 'Heavy 12 oz canvas that carries a laptop and lunch.',
    description: 'A roomy tote in heavy natural cotton canvas with reinforced, double-stitched handles and an inner pocket. Plain and unprinted, so it goes with everything.',
    collections: ['Basics', 'Women', 'Men'], category: 'Accessories', hsn: '4202', size_group: 'onesize',
    fabric: '100% cotton canvas, 12 oz', gsm: '400 GSM', fit: 'One size: 38 cm wide, 40 cm tall, 12 cm deep. Handle drop 26 cm.',
    care: 'Spot clean. Hand wash cold if needed. Dry flat.',
    origin: 'Stitched by a cooperative in Kozhikode, Kerala.',
    model_info: 'Holds up to 8 kg.', is_new: 0, sort: 12,
    colours: [{ name: 'Natural', hex: '#E3D8C0', image: '/img/products/canvas-tote-1.jpg' }],
    images: ['/img/products/canvas-tote-1.jpg', '/img/products/canvas-tote-2.jpg'],
    ratios: [0.32, 0.22, 0.06, 0.06],
  },
];

function colourCode(name) {
  return name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

// deterministic pseudo stock, so seeds are reproducible
function stockFor(pi, ci, si) {
  const v = (pi * 7 + ci * 5 + si * 3 + 4) % 11;
  const table = [14, 22, 9, 3, 18, 6, 0, 12, 2, 25, 8];
  return table[v];
}

export function buildCatalog(nowIso) {
  const products = [];
  const variants = [];
  P_LIST.forEach((p, pi) => {
    const price = P(p.price);
    products.push({
      id: p.id, name: p.name, tagline: p.tagline, description: p.description,
      collections: p.collections, category: p.category, price, mrp: P(p.mrp), hsn: p.hsn,
      fabric: p.fabric, gsm: p.gsm, fit: p.fit, care: p.care, origin: p.origin,
      model_info: p.model_info, size_group: p.size_group, images: p.images, colours: p.colours,
      ...cost(price, p.ratios), is_new: p.is_new, status: 'active', sort: p.sort, created_at: nowIso,
    });
    const sizes = p.size_group === 'onesize' ? ['OS'] : SIZES;
    p.colours.forEach((c, ci) => {
      sizes.forEach((s, si) => {
        const qty = p.size_group === 'onesize' ? 40 : stockFor(pi, ci, si);
        variants.push({
          sku: `NL-${p.sku}-${colourCode(c.name)}-${s}`, product_id: p.id, colour: c.name, size: s,
          on_hand: qty, reserved: 0, low_threshold: 3,
        });
      });
    });
  });
  return { products, variants };
}

export const DEFAULT_SETTINGS = {
  brand_name: 'NORTHLOOM',
  brand_tagline: 'Everyday linen and organic-cotton basics, made in India.',
  support_phone: '919061902295',
  support_email: 'hello@northloom.example',
  upi_vpa: 'northloom@okhdfcbank',
  upi_merchant_name: 'Northloom Apparel',
  upi_expiry_minutes: '30',
  cod_fee: String(4900),
  cod_max_order: String(500000),
  free_shipping_threshold: String(199900),
  shipping_standard_fee: String(7900),
  shipping_express_fee: String(14900),
  gst_threshold: String(250000), // unit price up to this (paise) -> low rate
  gst_rate_low: '5',
  gst_rate_high: '18',
  gst_rate_services: '18',
  store_state: 'Kerala',
  store_gstin: '32ABCDE1234F1Z5',
  store_address: 'Northloom Apparel Pvt Ltd, 14 Fort Road, Fort Kochi, Kochi, Kerala 682001',
};

export const DEFAULT_COUPONS = [
  { code: 'WELCOME10', type: 'percent', value: 10, min_order: 99900, expires_at: null, max_uses: 0, used: 0, active: 1 },
  { code: 'FLAT200', type: 'flat', value: 20000, min_order: 199900, expires_at: null, max_uses: 0, used: 0, active: 1 },
  { code: 'LINEN15', type: 'percent', value: 15, min_order: 299900, expires_at: null, max_uses: 500, used: 0, active: 1 },
  { code: 'OLDCODE', type: 'percent', value: 50, min_order: 0, expires_at: '2020-01-01T00:00:00.000Z', max_uses: 0, used: 0, active: 1 },
];

// [pincode, city, state, cod_ok, eta_days]
export const DEFAULT_PINCODES = [
  ['682001', 'Kochi', 'Kerala', 1, 2], ['682016', 'Kochi', 'Kerala', 1, 2], ['695001', 'Thiruvananthapuram', 'Kerala', 1, 3],
  ['673001', 'Kozhikode', 'Kerala', 1, 3], ['680001', 'Thrissur', 'Kerala', 1, 3],
  ['560001', 'Bengaluru', 'Karnataka', 1, 3], ['560034', 'Bengaluru', 'Karnataka', 1, 3], ['560038', 'Bengaluru', 'Karnataka', 1, 3], ['575001', 'Mangaluru', 'Karnataka', 1, 4],
  ['600001', 'Chennai', 'Tamil Nadu', 1, 3], ['641001', 'Coimbatore', 'Tamil Nadu', 1, 3], ['625001', 'Madurai', 'Tamil Nadu', 1, 4],
  ['500001', 'Hyderabad', 'Telangana', 1, 4], ['400001', 'Mumbai', 'Maharashtra', 1, 4], ['411001', 'Pune', 'Maharashtra', 1, 4],
  ['110001', 'New Delhi', 'Delhi', 1, 4], ['122001', 'Gurugram', 'Haryana', 1, 4], ['201301', 'Noida', 'Uttar Pradesh', 1, 5],
  ['226001', 'Lucknow', 'Uttar Pradesh', 1, 5], ['302001', 'Jaipur', 'Rajasthan', 1, 5], ['380001', 'Ahmedabad', 'Gujarat', 1, 5],
  ['700001', 'Kolkata', 'West Bengal', 1, 5], ['751001', 'Bhubaneswar', 'Odisha', 1, 6], ['800001', 'Patna', 'Bihar', 1, 6],
  ['160017', 'Chandigarh', 'Chandigarh', 1, 5], ['452001', 'Indore', 'Madhya Pradesh', 1, 5],
  // serviceable but prepaid-only (no COD)
  ['744101', 'Port Blair', 'Andaman and Nicobar Islands', 0, 9], ['682555', 'Kavaratti', 'Lakshadweep', 0, 10],
  ['190001', 'Srinagar', 'Jammu and Kashmir', 0, 8], ['194101', 'Leh', 'Ladakh', 0, 10], ['781001', 'Guwahati', 'Assam', 0, 7],
  ['795001', 'Imphal', 'Manipur', 0, 9], ['737101', 'Gangtok', 'Sikkim', 0, 8],
];

export const GST_STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Jammu and Kashmir', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal', 'Andaman and Nicobar Islands', 'Lakshadweep'];
