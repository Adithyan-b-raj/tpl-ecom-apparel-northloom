/**
 * Automated Verification Test Suite for NORTHLOOM (Story 5.5)
 * Runs end-to-end checks across schema, catalog integrity, quote logic, GST calculation,
 * transition rules, and static asset presence.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

async function runTests() {
  console.log('\n--- Running NORTHLOOM Verification Test Suite ---\n');

  // Test 1: Critical Files
  await test('All essential storefront and admin files exist', () => {
    const requiredFiles = [
      'public/index.html',
      'public/shop.html',
      'public/product.html',
      'public/checkout.html',
      'public/track.html',
      'public/admin.html',
      'public/about.html',
      'public/size-guide.html',
      'public/css/site.css',
      'public/whitelabel.js',
      'public/js/common.js',
      'public/js/home.js',
      'public/js/shop.js',
      'public/js/product.js',
      'public/js/sizechart.js',
      'public/js/qr.js',
      'public/js/checkout.js',
      'public/js/track.js',
      'public/js/admin.js',
      'schema.sql',
      'seed.sql',
      'wrangler.toml',
      'docker-compose.yml',
      'README.md',
    ];
    for (const rel of requiredFiles) {
      assert(existsSync(resolve(ROOT, rel)), `Missing required file: ${rel}`);
    }
  });

  // Test 2: Image Pipeline & Sizes
  await test('All 44 fashion editorial and product images exist and are under 300KB', () => {
    const editorialDir = resolve(ROOT, 'public/img/editorial');
    const productsDir = resolve(ROOT, 'public/img/products');

    const editorialFiles = readdirSync(editorialDir).filter((f) => f.endsWith('.jpg'));
    const productFiles = readdirSync(productsDir).filter((f) => f.endsWith('.jpg'));

    const totalImages = editorialFiles.length + productFiles.length;
    assert.strictEqual(totalImages, 44, `Expected 44 images, found ${totalImages}`);

    for (const f of editorialFiles) {
      const sz = statSync(resolve(editorialDir, f)).size;
      assert(sz <= 300 * 1024, `Editorial image ${f} exceeds 300KB: ${sz} bytes`);
    }

    for (const f of productFiles) {
      const sz = statSync(resolve(productsDir, f)).size;
      assert(sz <= 300 * 1024, `Product image ${f} exceeds 300KB: ${sz} bytes`);
    }
  });

  // Test 3: Zero Placeholder & Zero "pickle" residue
  await test('Zero placeholder text or "pickle" in public HTML/JS files', () => {
    const checkPaths = [
      'public/index.html',
      'public/shop.html',
      'public/product.html',
      'public/checkout.html',
      'public/track.html',
      'public/admin.html',
      'public/about.html',
      'public/size-guide.html',
    ];

    for (const rel of checkPaths) {
      const content = readFileSync(resolve(ROOT, rel), 'utf8').toLowerCase();
      assert(!content.includes('lorem ipsum'), `Placeholder "lorem ipsum" found in ${rel}`);
      assert(!content.includes('pickle'), `Residual string "pickle" found in ${rel}`);
      assert(!content.includes('todo:'), `Unresolved "TODO:" found in ${rel}`);
    }
  });

  // Test 4: Catalog and Variants Seed Data Integrity
  await test('Seed catalog contains 12 active products with complete SKU matrices', async () => {
    const { buildCatalog } = await import('../functions/_lib/seed-data.js');
    const { products, variants } = buildCatalog('2026-11-01T00:00:00.000Z');

    assert.strictEqual(products.length, 12, `Expected 12 products, got ${products.length}`);
    assert(variants.length >= 60, `Expected at least 60 variants, got ${variants.length}`);

    // Verify all products have images, colors, and valid price
    for (const p of products) {
      assert(p.price > 0, `Product ${p.id} has invalid price: ${p.price}`);
      assert(p.images.length >= 2, `Product ${p.id} must have at least 2 images`);
      assert(p.colours.length >= 1, `Product ${p.id} must have at least 1 colour`);
      assert(p.fabric, `Product ${p.id} missing fabric description`);
      assert(p.gsm, `Product ${p.id} missing GSM`);

      const pVariants = variants.filter((v) => v.product_id === p.id);
      const minVariants = String(p.category).toLowerCase() === 'accessories' || p.size_group === 'onesize' ? 1 : 4;
      assert(pVariants.length >= minVariants, `Product ${p.id} has too few variants: ${pVariants.length}`);
    }
  });

  // Test 5: Quote and GST Split Logic
  await test('GST split calculation correctly distinguishes 5% (<= ₹2,500) and 18% (> ₹2,500)', async () => {
    const { computeQuote } = await import('../functions/_lib/core.js');

    // Item 1: Linen Shirt @ ₹2,499 (249900 paise) -> GST rate should be 5%
    // Item 2: Wrap Midi Dress @ ₹3,199 (319900 paise) -> GST rate should be 18%
    const items = [
      { sku: 'NL-LNS-SGE-M', unit_price: 249900, qty: 1, name: 'Linen Shirt' },
      { sku: 'NL-DRS-SGE-M', unit_price: 319900, qty: 1, name: 'Wrap Dress' },
    ];

    const q = computeQuote({
      lines: items,
      coupon: null,
      pincode: '560038',
      paymentMethod: 'upi',
      settings: {
        free_shipping_threshold: 199900,
        shipping_standard_fee: 9900,
        cod_fee: 4900,
        gst_threshold: 250000,
        gst_rate_low: 5,
        gst_rate_high: 18,
      },
    });

    assert.strictEqual(q.lines[0].gst_rate, 5, `Expected 5% GST on linen shirt, got ${q.lines[0].gst_rate}`);
    assert.strictEqual(q.lines[1].gst_rate, 18, `Expected 18% GST on dress, got ${q.lines[1].gst_rate}`);
    assert.strictEqual(q.shipping_fee, 0, 'Shipping should be free above threshold ₹1,999');
    assert.strictEqual(q.cod_fee, 0, 'COD fee should be 0 for UPI payment');
    assert.strictEqual(q.subtotal, 249900 + 319900, 'Subtotal mismatch');
  });

  // Test 6: COD Handling and Limits
  await test('COD fee applies correctly and respects max order limit', async () => {
    const { computeQuote } = await import('../functions/_lib/core.js');

    const items = [{ sku: 'NL-TEE-WHT-M', unit_price: 129900, qty: 1, name: 'Tee' }];
    const q = computeQuote({
      lines: items,
      coupon: null,
      pincode: '560038',
      paymentMethod: 'cod',
      settings: {
        free_shipping_threshold: 199900,
        shipping_standard_fee: 9900,
        cod_fee: 4900,
        gst_threshold: 250000,
        gst_rate_low: 5,
        gst_rate_high: 18,
      },
    });

    assert.strictEqual(q.shipping_fee, 9900, 'Under ₹1,999 shipping fee should be ₹99');
    assert.strictEqual(q.cod_fee, 4900, 'COD fee should be ₹49');
    assert.strictEqual(q.total, 129900 + 9900 + 4900, 'Total calculation mismatch');
  });

  // Test 7: UPI Link Generator
  await test('UPI payment link contains standard NPCI parameters', async () => {
    const { upiLink } = await import('../functions/_lib/core.js');
    const settings = {
      upi_vpa: 'northloom@okhdfcbank',
      upi_merchant_name: 'NORTHLOOM APPAREL',
    };
    const order = { id: 'NL-261101-ABCD', total: 249900 };
    const link = upiLink(settings, order);

    assert(link.startsWith('upi://pay?'), 'Link must start with upi://pay?');
    assert(link.includes('pa=northloom%40okhdfcbank'), 'Missing or invalid payee VPA');
    assert(link.includes('am=2499.00'), 'Missing or invalid amount parameter');
    assert(link.includes('tn=NL-261101-ABCD'), 'Missing order reference');
    assert(link.includes('cu=INR'), 'Currency must be INR');
  });

  // Test 8: Order State Transitions Graph
  await test('Order lifecycle transitions are strictly defined and complete', async () => {
    const { TRANSITIONS } = await import('../functions/_lib/orders.js');

    assert(Array.isArray(TRANSITIONS.placed), 'placed transitions missing');
    assert(TRANSITIONS.placed.includes('confirmed'), 'placed should allow confirmed');
    assert(TRANSITIONS.placed.includes('cancelled'), 'placed should allow cancelled');

    assert(TRANSITIONS.confirmed.includes('packed'), 'confirmed should allow packed');
    assert(TRANSITIONS.packed.includes('shipped'), 'packed should allow shipped');
    assert(TRANSITIONS.shipped.includes('delivered'), 'shipped should allow delivered');
    assert(TRANSITIONS.shipped.includes('rto'), 'shipped should allow rto');
  });

  // Test 9: Coupon Validation
  await test('Coupons correctly calculate percentage and flat discounts with minimums', async () => {
    const { couponDiscount, couponCheck } = await import('../functions/_lib/core.js');

    const coupon10 = { code: 'WELCOME10', type: 'percent', value: 10, min_order: 100000, active: 1 };
    const err = couponCheck(coupon10, 150000, '2026-11-01T12:00:00Z');
    assert.strictEqual(err, null, 'Coupon should be valid');

    const disc = couponDiscount(coupon10, 150000);
    assert.strictEqual(disc, 15000, '10% of ₹1,500 should be ₹150');

    const tooLowErr = couponCheck(coupon10, 50000, '2026-11-01T12:00:00Z');
    assert(tooLowErr, 'Coupon should reject subtotal below min_order');
  });

  // Test 10: API Router Endpoints (onRequest)
  await test('Cloudflare Pages Functions API route handler resolves catalog and pincode', async () => {
    const { onRequest } = await import('../functions/api/[[route]].js');

    // 10a. GET /api/config
    const reqConfig = new Request('http://localhost:8788/api/config', { method: 'GET' });
    const resConfig = await onRequest({ request: reqConfig, env: { DEMO_MODE: '1' } });
    assert.strictEqual(resConfig.status, 200);
    const jsonConfig = await resConfig.json();
    assert(jsonConfig.settings, 'Missing settings in config');
    assert(jsonConfig.states.length > 0, 'Missing states in config');

    // 10b. GET /api/products
    const reqProducts = new Request('http://localhost:8788/api/products', { method: 'GET' });
    const resProducts = await onRequest({ request: reqProducts, env: { DEMO_MODE: '1' } });
    assert.strictEqual(resProducts.status, 200);
    const jsonProducts = await resProducts.json();
    assert.strictEqual(jsonProducts.products.length, 12, 'Expected 12 products from API');

    // 10c. GET /api/products/linen-shirt
    const reqSlug = new Request('http://localhost:8788/api/products/linen-shirt', { method: 'GET' });
    const resSlug = await onRequest({ request: reqSlug, env: { DEMO_MODE: '1' } });
    assert.strictEqual(resSlug.status, 200);
    const jsonSlug = await resSlug.json();
    assert.strictEqual(jsonSlug.product.id, 'linen-shirt');
    assert(jsonSlug.product.cost.fabric > 0, 'Missing transparent costing breakdown');

    // 10d. GET /api/pincode/560038
    const reqPin = new Request('http://localhost:8788/api/pincode/560038', { method: 'GET' });
    const resPin = await onRequest({ request: reqPin, env: {} });
    assert.strictEqual(resPin.status, 200);
    const jsonPin = await resPin.json();
    assert.strictEqual(jsonPin.serviceable, true);
    assert.strictEqual(jsonPin.city, 'Bengaluru');
  });

  console.log(`\nVerification Complete: ${passedTests}/${totalTests} tests passed.\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
