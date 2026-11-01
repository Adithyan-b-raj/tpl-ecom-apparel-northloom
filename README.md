# NORTHLOOM — Everyday Linen & Organic-Cotton Basics

> Movement S: Radical-Transparency Editorial Minimal Apparel Storefront with Indian Cash on Delivery (COD) + Dynamic UPI Checkout and Store Owner Admin Operations Panel.

Run live on Cloudflare Pages (`*.pages.dev`) with Cloudflare D1 SQLite persistence and V8 Edge Functions.

---

## 1. Highlights & Capabilities

- **Editorial Minimal Aesthetics (Movement S):**
  - Off-white `#F7F4EE` canvas, Ink `#1B1A17` typography, Sand `#E9E1D3` cards, Sage & Clay accents.
  - Serif headings (`Newsreader`) paired with clean sans body (`Inter Tight`).
  - True Cost radical transparency breakdown on every product and on the homepage.
  - Colorway swatches with real product photography, XS–XXL live size availability matrix, and fit guides.

- **Indian E-Commerce Checkout:**
  - **Dynamic UPI Payment:** Standard `upi://pay` intent link, client-side SVG QR code generator, 30-minute reservation countdown timer, and customer 12-digit UTR submission.
  - **Cash on Delivery (COD):** ₹49 handling fee calculation, ₹5,000 maximum order cap, and 6-digit pincode serviceability verification.
  - **Indian Apparel GST:** Built-in GST rules (5% on items $\le ₹2,500$; 18% on items $> ₹2,500$).
  - **Order Tracking:** Real-time 5-step status timeline (`placed` $\rightarrow$ `confirmed` $\rightarrow$ `packed` $\rightarrow$ `shipped` $\rightarrow$ `delivered`), courier tracking AWB link, and printable GST Tax Invoice.

- **Store Owner Operations Portal (`/admin.html`):**
  - Session-authenticated command center (`ADMIN_PASSWORD` or demo password `northloom-demo`).
  - Operations Dashboard: Real-time revenue, orders today, pending COD confirmations, pending UPI UTR verifications, to-pack and to-ship queues, and low-stock alerts.
  - Order Lifecycle Management: 1-click status transitions, courier dispatching with AWB tracking, UPI verification/rejection, and printable GST Invoice / Packing Slip.
  - Inventory Matrix: Product $\times$ Color $\times$ Size grid with live On-Hand, Reserved, and Available stock, stock adjustment modal with audit reason codes, and PO receiving intake.
  - Immutable Stock Ledger: Complete audit trail of all stock movements with CSV export.

---

## 2. Directory Structure

```
tpl-ecom-apparel-northloom/
├── functions/
│   ├── api/
│   │   └── [[route]].js          # Catch-all Cloudflare Pages Function router
│   └── _lib/
│       ├── admin.js              # Admin dashboard, inventory adjustment, coupons
│       ├── core.js               # Crypto, HMAC, session cookies, quote calculation
│       ├── invoice.js            # Printable A4 GST Tax Invoice and Packing Slip
│       ├── orders.js             # Order placement, atomic stock reservations, transitions
│       ├── seed-data.js          # Catalog, variants, pincodes, and default settings
│       └── seed.js               # SQL seed statement generator
├── public/
│   ├── css/
│   │   └── site.css              # Movement S styling, tokens, and layouts
│   ├── img/
│   │   ├── editorial/            # 13 compressed editorial lifestyle & fabric photos
│   │   └── products/             # 31 compressed product shots across 12 items
│   ├── js/
│   │   ├── admin.js              # Admin portal runtime
│   │   ├── checkout.js           # 2-step checkout & payment handler
│   │   ├── common.js             # Cart, drawer, toast, header/footer chrome
│   │   ├── home.js               # Homepage hero slider & True Cost tabs
│   │   ├── product.js            # PDP swatch selector & size matrix
│   │   ├── qr.js                 # Standalone SVG QR code generator
│   │   ├── shop.js               # Catalog filtering & quick-add
│   │   ├── sizechart.js          # Fit measurements & size guides
│   │   └── track.js              # Real-time order tracker
│   ├── about.html                # Authentic story & transparent costing
│   ├── admin.html                # Operations management console
│   ├── checkout.html             # COD + UPI checkout
│   ├── index.html                # Storefront landing page
│   ├── product.html              # PDP
│   ├── shop.html                 # Catalog
│   ├── size-guide.html           # Size tables
│   ├── track.html                # Order tracker
│   └── whitelabel.js             # Multi-brand query parameter engine (?brand=...)
├── schema.sql                    # Cloudflare D1 SQLite database schema
├── seed.sql                      # Initial catalog, variants, and settings
├── wrangler.toml                 # Cloudflare Pages deployment configuration
└── docker-compose.yml            # Headless self-hosted adapter
```

---

## 3. Local Development

```bash
# Install dependencies
npm install

# Initialize local SQLite database
npm run db:local

# Start local Cloudflare Pages dev server
npm run dev
# Server runs on http://localhost:8788
```

Admin credentials:
- Username: `admin`
- Password: `northloom-demo` (when `DEMO_MODE=1`)
