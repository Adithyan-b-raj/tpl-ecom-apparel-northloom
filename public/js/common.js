/* NORTHLOOM storefront runtime: api, cart, wishlist, header/footer, drawer, cards */
(function () {
  'use strict';
  var SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'OS'];
  var NL = (window.NL = {});

  NL.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  NL.inr = function (p) { return '\u20B9' + Math.round(p / 100).toLocaleString('en-IN'); };
  NL.inr2 = function (p) { return '\u20B9' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  NL.sizeSort = function (a, b) { return SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b); };
  NL.$ = function (s, r) { return (r || document).querySelector(s); };
  NL.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  NL.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  NL.api = function (path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.method = opts.method || 'POST'; init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch('/api/' + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || 'Request failed'); e.status = r.status; e.data = d; throw e; }
        return d;
      });
    });
  };

  var cfgP;
  NL.config = function () { return cfgP || (cfgP = NL.api('config').catch(function () { return { settings: {}, states: [] }; })); };

  NL.toast = function (msg, bad) {
    var t = NL.$('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(NL._tt); NL._tt = setTimeout(function () { t.className = 'toast' + (bad ? ' bad' : ''); }, 2800);
  };

  /* ---------- cart ---------- */
  var CART_KEY = 'nl_cart_v1', COUPON_KEY = 'nl_coupon_v1';
  NL.cart = {
    items: function () { return NL.store.get(CART_KEY, []); },
    save: function (items) { NL.store.set(CART_KEY, items); NL.cart.badge(); document.dispatchEvent(new CustomEvent('nl:cart')); },
    count: function () { return NL.cart.items().reduce(function (a, i) { return a + i.qty; }, 0); },
    add: function (sku, qty) {
      var items = NL.cart.items(); var f = items.filter(function (i) { return i.sku === sku; })[0];
      if (f) f.qty = Math.min(10, f.qty + (qty || 1)); else items.push({ sku: sku, qty: qty || 1 });
      NL.cart.save(items);
    },
    set: function (sku, qty) {
      var items = NL.cart.items().map(function (i) { return i.sku === sku ? { sku: sku, qty: qty } : i; }).filter(function (i) { return i.qty > 0; });
      NL.cart.save(items);
    },
    clear: function () { NL.cart.save([]); },
    coupon: function () { return NL.store.get(COUPON_KEY, ''); },
    setCoupon: function (c) { NL.store.set(COUPON_KEY, c || ''); },
    badge: function () { NL.$$('[data-cart-count]').forEach(function (el) { var n = NL.cart.count(); el.textContent = n || ''; el.setAttribute('data-n', n); }); },
    quote: function (extra) {
      var items = NL.cart.items();
      if (!items.length) return Promise.resolve(null);
      var body = Object.assign({ items: items, coupon: NL.cart.coupon() }, extra || {});
      return NL.api('quote', { body: body });
    },
  };

  /* ---------- wishlist / recently viewed ---------- */
  NL.wish = {
    list: function () { return NL.store.get('nl_wish', []); },
    has: function (id) { return NL.wish.list().indexOf(id) > -1; },
    toggle: function (id) {
      var l = NL.wish.list(); var i = l.indexOf(id);
      if (i > -1) l.splice(i, 1); else l.push(id);
      NL.store.set('nl_wish', l); NL.wish.badge(); return i === -1;
    },
    badge: function () { NL.$$('[data-wish-count]').forEach(function (el) { var n = NL.wish.list().length; el.textContent = n || ''; el.setAttribute('data-n', n); }); },
  };
  NL.recent = {
    list: function () { return NL.store.get('nl_recent', []); },
    push: function (id) { var l = NL.recent.list().filter(function (x) { return x !== id; }); l.unshift(id); NL.store.set('nl_recent', l.slice(0, 8)); },
  };

  /* ---------- icons ---------- */
  var ICON = {
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 8h16M4 16h16"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7.3L12 17.8 5.7 21.5l1.7-7.3L2 9.5l7.1-.6z"/></svg>',
  };
  NL.icon = function (n) { return ICON[n] || ''; };

  /* ---------- header / footer ---------- */
  var NAV = [['Women', '/shop.html?collection=Women'], ['Men', '/shop.html?collection=Men'], ['Basics', '/shop.html?collection=Basics'], ['New', '/shop.html?collection=New'], ['True cost', '/#true-cost'], ['About', '/about.html']];
  NL.mountChrome = function () {
    var active = document.body.getAttribute('data-nav') || '';
    var h = NL.$('#siteHeader');
    if (h) {
      h.innerHTML =
        '<div class="announce" data-wl-announce>Free shipping above \u20B91,999 &nbsp;/&nbsp; Cash on delivery &amp; UPI &nbsp;/&nbsp; 7-day easy returns</div>' +
        '<header class="site-header"><div class="container bar">' +
        '<a class="brand-logo" href="/" aria-label="Northloom home">NORTHLOOM</a>' +
        '<nav class="nav" aria-label="Primary">' + NAV.map(function (n) { return '<a href="' + n[1] + '"' + (n[0] === active ? ' class="active"' : '') + '>' + n[0] + '</a>'; }).join('') + '</nav>' +
        '<div class="hdr-actions">' +
        '<a class="icon-btn" href="/track.html" style="font-size:13px" aria-label="Track order"><span class="trk">Track</span></a>' +
        '<a class="icon-btn" href="/shop.html?wishlist=1" aria-label="Wishlist">' + ICON.heart + '<span class="count" data-wish-count></span></a>' +
        '<button class="icon-btn" id="openCart" aria-label="Open bag">' + ICON.bag + '<span class="count" data-cart-count></span></button>' +
        '<button class="icon-btn burger" id="openMenu" aria-label="Menu" aria-expanded="false">' + ICON.menu + '</button>' +
        '</div></div>' +
        '<div class="mobile-nav" id="mobileNav">' + NAV.map(function (n) { return '<a href="' + n[1] + '">' + n[0] + '</a>'; }).join('') + '<a href="/track.html">Track order</a><a href="/size-guide.html">Size guide</a></div></header>';
      NL.$('#openMenu').addEventListener('click', function () { var m = NL.$('#mobileNav'); var o = m.classList.toggle('open'); this.setAttribute('aria-expanded', o); });
    }
    var f = NL.$('#siteFooter');
    if (f) {
      f.innerHTML =
        '<footer class="site-footer"><div class="container"><div class="foot-grid">' +
        '<div><div class="brand-logo">NORTHLOOM</div><p class="muted" style="margin-top:14px;max-width:34ch" data-wl-tagline>Everyday linen and organic-cotton basics, made in India.</p><p class="muted" style="font-size:13px" id="drawerWaText">Support: +91 90619 02295</p></div>' +
        '<div><h4>Shop</h4><a href="/shop.html?collection=Women">Women</a><a href="/shop.html?collection=Men">Men</a><a href="/shop.html?collection=Basics">Basics</a><a href="/shop.html?collection=New">New this week</a></div>' +
        '<div><h4>Help</h4><a href="/track.html">Track an order</a><a href="/size-guide.html">Size guide</a><a href="/about.html#delivery">Delivery &amp; returns</a><a href="/about.html#cod">Cash on delivery</a></div>' +
        '<div><h4>Company</h4><a href="/about.html">Our story</a><a href="/#true-cost">True cost</a><a href="/admin.html">Store admin</a></div>' +
        '</div><div class="foot-bottom"><span>&copy; Northloom Apparel. Prices include GST.</span><span>Made in Tiruppur, Kochi &amp; Jaipur</span></div></div></footer>' +
        '<a class="wa-float" id="floatingWaBtn" href="https://wa.me/919061902295?text=Hi%20Northloom" target="_blank" rel="noopener">WhatsApp us</a>';
    }
    // drawer
    var d = document.createElement('div');
    d.innerHTML = '<div class="overlay" id="overlay"></div><aside class="drawer" id="cartDrawer" aria-label="Shopping bag" aria-hidden="true"><div class="drawer-head"><span>Your bag</span><button class="icon-btn" id="closeCart" aria-label="Close bag">' + ICON.close + '</button></div><div class="drawer-body" id="drawerBody"></div><div class="drawer-foot" id="drawerFoot"></div></aside>';
    document.body.appendChild(d);
    var oc = NL.$('#openCart'); if (oc) oc.addEventListener('click', NL.openDrawer);
    NL.$('#closeCart').addEventListener('click', NL.closeDrawer);
    NL.$('#overlay').addEventListener('click', function () { NL.closeDrawer(); var fl = NL.$('.filters'); if (fl) fl.classList.remove('on'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') NL.closeDrawer(); });
    NL.cart.badge(); NL.wish.badge();
    if (window.applyWhiteLabel) window.applyWhiteLabel();
    NL.config().then(function (c) {
      var s = c.settings || {};
      var th = Number(s.free_shipping_threshold || 199900);
      var a = NL.$('[data-wl-announce]');
      if (a && !(window.__WL_CONFIG && window.__WL_CONFIG.brand)) a.innerHTML = 'Free shipping above ' + NL.inr(th) + ' &nbsp;/&nbsp; Cash on delivery &amp; UPI &nbsp;/&nbsp; 7-day easy returns';
    });
  };

  NL.openDrawer = function () {
    NL.$('#overlay').classList.add('on'); var d = NL.$('#cartDrawer'); d.classList.add('on'); d.setAttribute('aria-hidden', 'false');
    NL.renderCart(NL.$('#drawerBody'), NL.$('#drawerFoot'), true);
  };
  NL.closeDrawer = function () {
    var o = NL.$('#overlay'), d = NL.$('#cartDrawer'); if (!o) return;
    o.classList.remove('on'); d.classList.remove('on'); d.setAttribute('aria-hidden', 'true');
  };

  /* shared cart renderer for drawer and cart page */
  NL.renderCart = function (body, foot, isDrawer) {
    var items = NL.cart.items();
    if (!items.length) {
      body.innerHTML = '<div class="empty"><h3>Your bag is empty</h3><p>Pick up something plain and good.</p><a class="btn" href="/shop.html" style="margin-top:12px">Shop all</a></div>';
      foot.innerHTML = ''; return Promise.resolve();
    }
    body.innerHTML = '<div class="empty muted">Loading your bag...</div>';
    return Promise.all([NL.cart.quote(), NL.config()]).then(function (r) {
      var q = r[0], s = r[1].settings || {};
      var th = Number(s.free_shipping_threshold || 199900), net = q.subtotal - q.discount;
      var left = Math.max(0, th - net);
      var pct = Math.min(100, Math.round((net / th) * 100));
      var html = '<div class="ship-bar"><span>' + (left > 0 ? 'Add <b>' + NL.inr(left) + '</b> more for free shipping' : '<b>You have unlocked free shipping</b>') + '</span><div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>';
      html += q.lines.map(function (l) {
        var over = l.qty > l.available;
        return '<div class="ln"><a href="/product.html?slug=' + encodeURIComponent(l.product_id) + '" tabindex="-1"><img src="' + NL.esc(l.image) + '" alt="" width="76" height="95" loading="lazy"></a><div><div class="nm">' + NL.esc(l.name) + '</div><div class="vr">' + NL.esc(l.colour) + ' / ' + NL.esc(l.size) + '</div>' +
          (over ? '<div class="warn-line">' + (l.available ? 'Only ' + l.available + ' left' : 'Sold out') + ' - please reduce quantity</div>' : '') +
          '<div class="ctl"><div class="qty"><button data-q="-1" data-sku="' + NL.esc(l.sku) + '" aria-label="Decrease">&minus;</button><span>' + l.qty + '</span><button data-q="1" data-sku="' + NL.esc(l.sku) + '" aria-label="Increase">+</button></div><span class="price">' + NL.inr(l.unit_price * l.qty) + '</span></div><button class="rm" data-rm="' + NL.esc(l.sku) + '">Remove</button></div></div>';
      }).join('');
      body.innerHTML = html;
      var hasOver = q.lines.some(function (l) { return l.qty > l.available; });
      var f = '<form class="coupon" id="couponForm"><input type="text" id="couponInput" placeholder="Coupon code" value="' + NL.esc(q.coupon || NL.cart.coupon()) + '" aria-label="Coupon code" autocomplete="off"><button class="btn ghost sm" type="submit">Apply</button></form><div id="couponMsg" style="font-size:12.5px;min-height:18px;margin:-6px 0 6px;color:' + (q.coupon_error ? 'var(--bad)' : 'var(--ok)') + '">' + NL.esc(q.coupon_error || (q.coupon ? 'Coupon ' + q.coupon + ' applied' : '')) + '</div>';
      f += '<div class="sum-row"><span>Subtotal</span><span>' + NL.inr(q.subtotal) + '</span></div>';
      if (q.discount) f += '<div class="sum-row"><span>Discount</span><span>&minus; ' + NL.inr(q.discount) + '</span></div>';
      f += '<div class="sum-row"><span>Shipping</span><span>' + (q.shipping_fee ? NL.inr(q.shipping_fee) : 'Free') + '</span></div>';
      f += '<div class="sum-row total"><span>Total <small class="muted" style="font-weight:400">incl. GST</small></span><span>' + NL.inr(q.total) + '</span></div>';
      f += '<a class="btn block" style="margin-top:14px' + (hasOver ? ';pointer-events:none;opacity:.45' : '') + '" href="/checkout.html">Checkout</a>';
      if (isDrawer) f += '<a class="link" style="display:inline-block;margin-top:12px" href="/cart.html">View full bag</a>';
      foot.innerHTML = f;
      var rerender = function () { NL.renderCart(body, foot, isDrawer); };
      NL.$$('[data-q]', body).forEach(function (b) { b.addEventListener('click', function () {
        var sku = b.getAttribute('data-sku'), cur = NL.cart.items().filter(function (i) { return i.sku === sku; })[0];
        NL.cart.set(sku, Math.min(10, cur.qty + Number(b.getAttribute('data-q')))); rerender();
      }); });
      NL.$$('[data-rm]', body).forEach(function (b) { b.addEventListener('click', function () { NL.cart.set(b.getAttribute('data-rm'), 0); rerender(); }); });
      NL.$('#couponForm', foot).addEventListener('submit', function (e) {
        e.preventDefault(); NL.cart.setCoupon(NL.$('#couponInput', foot).value.trim().toUpperCase()); rerender();
      });
    }).catch(function (e) {
      body.innerHTML = '<div class="empty"><h3>Could not load your bag</h3><p>' + NL.esc(e.message) + '</p></div>'; foot.innerHTML = '';
    });
  };

  /* ---------- product helpers + card ---------- */
  NL.avail = function (p) { return p.variants.reduce(function (a, v) { return a + v.available; }, 0); };
  NL.colourImage = function (p, name) { var c = p.colours.filter(function (x) { return x.name === name; })[0]; return (c && c.image) || p.images[0]; };
  NL.card = function (p) {
    var total = NL.avail(p), low = total > 0 && p.variants.every(function (v) { return v.available === 0 || v.low; }) && total < 12;
    var main = p.colours[0] ? p.colours[0].image || p.images[0] : p.images[0];
    var alt = p.images[1] || '';
    var firstColour = (p.colours.filter(function (c) { return p.variants.some(function (v) { return v.colour === c.name && v.available > 0; }); })[0] || p.colours[0] || {}).name;
    var sizes = p.variants.filter(function (v) { return v.colour === firstColour; }).sort(function (a, b) { return NL.sizeSort(a.size, b.size); });
    var tags = (p.is_new ? '<span class="tag">New</span>' : '') + (total === 0 ? '<span class="tag out">Sold out</span>' : (low ? '<span class="tag low">Low stock</span>' : ''));
    var on = NL.wish.has(p.id) ? ' on' : '';
    return '<article class="card" data-id="' + NL.esc(p.id) + '"><a class="ph" href="/product.html?slug=' + encodeURIComponent(p.id) + '" aria-label="' + NL.esc(p.name) + '">' +
      '<img src="' + NL.esc(main) + '" alt="' + NL.esc(p.name) + '" width="800" height="1000" loading="lazy">' + (alt ? '<img class="alt" src="' + NL.esc(alt) + '" alt="" width="800" height="1000" loading="lazy">' : '') + '</a>' +
      '<div class="tags">' + tags + '</div><button class="wish' + on + '" data-wish="' + NL.esc(p.id) + '" aria-label="Save to wishlist">' + ICON.heart + '</button>' +
      (total > 0 ? '<div class="quick"><div class="lbl">Quick add</div><div class="sizes">' + sizes.map(function (v) { return '<button class="size-btn" data-add="' + NL.esc(v.sku) + '"' + (v.available < 1 ? ' disabled' : '') + '>' + NL.esc(v.size === 'OS' ? 'One size' : v.size) + '</button>'; }).join('') + '</div></div>' : '') +
      '<div class="meta"><a class="name" href="/product.html?slug=' + encodeURIComponent(p.id) + '">' + NL.esc(p.name) + '</a>' +
      '<div class="price">' + NL.inr(p.price) + (p.mrp > p.price ? '<s>' + NL.inr(p.mrp) + '</s>' : '') + '</div>' +
      (p.colours.length > 1 ? '<div class="dots" aria-label="' + p.colours.length + ' colours">' + p.colours.map(function (c) { return '<span class="dot" title="' + NL.esc(c.name) + '" style="background:' + NL.esc(c.hex) + '"></span>'; }).join('') + '</div>' : '<div class="sub">' + NL.esc(p.colours[0] ? p.colours[0].name : '') + '</div>') + '</div></article>';
  };
  // delegated handlers for cards
  document.addEventListener('click', function (e) {
    var add = e.target.closest && e.target.closest('[data-add]');
    if (add && !add.disabled) { NL.cart.add(add.getAttribute('data-add'), 1); NL.openDrawer(); return; }
    var w = e.target.closest && e.target.closest('[data-wish]');
    if (w) { e.preventDefault(); var on = NL.wish.toggle(w.getAttribute('data-wish')); w.classList.toggle('on', on); NL.toast(on ? 'Saved to wishlist' : 'Removed from wishlist'); }
  });

  NL.products = function () { return NL.api('products').then(function (d) { return d.products; }); };
  NL.skeletonGrid = function (n) { var h = ''; for (var i = 0; i < n; i++) h += '<div><div class="skeleton" style="aspect-ratio:4/5"></div><div class="skeleton" style="height:14px;margin-top:12px;width:70%"></div></div>'; return h; };

  NL.stars = function (n) { var s = ''; for (var i = 0; i < n; i++) s += ICON.star; return '<span class="stars" aria-label="' + n + ' out of 5">' + s + '</span>'; };

  // true-cost breakdown (all in paise); rate from config
  NL.trueCost = function (p, s) {
    var th = Number((s || {}).gst_threshold || 250000), low = Number((s || {}).gst_rate_low || 5), high = Number((s || {}).gst_rate_high || 18);
    var rate = p.price <= th ? low : high, gst = p.price - Math.round(p.price * 100 / (100 + rate));
    var c = p.cost, margin = p.price - gst - c.fabric - c.labour - c.transport - c.duties;
    return { rate: rate, parts: [
      { k: 'Fabric and trims', v: c.fabric, c: '#1B1A17' }, { k: 'Cutting and stitching', v: c.labour, c: '#6A655B' },
      { k: 'Freight and packaging', v: c.transport, c: '#9AA58B' }, { k: 'Duties and mill levies', v: c.duties, c: '#C9BBA0' },
      { k: 'GST (' + rate + '%)', v: gst, c: '#E9E1D3' }, { k: 'Our margin', v: margin, c: '#B8876B' },
    ], price: p.price };
  };
  NL.trueCostHTML = function (t) {
    var bar = '<div class="tc-bar" role="img" aria-label="Price breakdown">' + t.parts.map(function (x) { return '<i style="width:' + (x.v / t.price * 100).toFixed(2) + '%;background:' + x.c + '" title="' + NL.esc(x.k) + '"></i>'; }).join('') + '</div>';
    var rows = '<div class="tc-rows">' + t.parts.map(function (x) { return '<div class="tc-row"><span class="sw" style="background:' + x.c + ';border:1px solid rgba(27,26,23,.25)"></span><span>' + NL.esc(x.k) + '</span><span class="pc">' + (x.v / t.price * 100).toFixed(0) + '%</span><b>' + NL.inr(x.v) + '</b></div>'; }).join('') + '<div class="tc-row total"><span></span><span>You pay</span><span></span><b>' + NL.inr(t.price) + '</b></div></div>';
    return bar + rows;
  };

  NL.newsletter = function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var inp = NL.$('input', form), msg = NL.$('.msg', form);
      NL.api('newsletter', { body: { email: inp.value } }).then(function () { msg.textContent = 'Thank you. You are on the list.'; inp.value = ''; }).catch(function (er) { msg.textContent = er.message; });
    });
  };

  document.addEventListener('DOMContentLoaded', NL.mountChrome);
})();
