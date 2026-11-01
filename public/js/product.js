(function () {
  var NL = window.NL, slug = new URLSearchParams(location.search).get('slug') || '';
  var root = NL.$('#pdpRoot'), P, settings = {}, colour = '', size = '', imgIdx = 0, all = [];

  function variantsFor(c) { return P.variants.filter(function (v) { return v.colour === c; }).sort(function (a, b) { return NL.sizeSort(a.size, b.size); }); }
  function gallery() { var m = NL.colourImage(P, colour), l = [m]; P.images.forEach(function (i) { if (l.indexOf(i) < 0 && !P.colours.some(function (c) { return c.image === i && c.name !== colour; })) l.push(i); }); return l; }

  function drawGallery() {
    var g = gallery(); imgIdx = Math.min(imgIdx, g.length - 1);
    NL.$('#gmain').innerHTML = '<img src="' + NL.esc(g[imgIdx]) + '" alt="' + NL.esc(P.name + ' in ' + colour) + '" width="1000" height="1250">';
    NL.$('#thumbs').innerHTML = g.map(function (src, k) { return '<button class="' + (k === imgIdx ? 'on' : '') + '" data-i="' + k + '" aria-label="View image ' + (k + 1) + '"><img src="' + NL.esc(src) + '" alt="" width="152" height="190" loading="lazy"></button>'; }).join('');
  }
  function drawSizes() {
    var vs = variantsFor(colour);
    NL.$('#sizes').innerHTML = vs.map(function (v) {
      return '<button class="size-btn' + (v.size === size ? ' on' : '') + '" data-sku="' + NL.esc(v.sku) + '" data-size="' + NL.esc(v.size) + '"' + (v.available < 1 ? ' disabled aria-label="' + v.size + ' sold out"' : '') + '>' + (v.size === 'OS' ? 'One size' : v.size) + '</button>';
    }).join('');
    var note = NL.$('#stockNote'), sel = vs.filter(function (v) { return v.size === size; })[0];
    if (sel) {
      if (sel.available <= 5) { note.className = 'stock-note'; note.textContent = 'Only ' + sel.available + ' left in ' + (sel.size === 'OS' ? 'this colour' : 'size ' + sel.size); }
      else { note.className = 'stock-note ok'; note.textContent = 'In stock - ships in 24 hours'; }
    } else {
      var lows = vs.filter(function (v) { return v.available > 0 && v.available <= 5; });
      var out = vs.filter(function (v) { return v.available < 1; });
      note.className = 'stock-note';
      note.textContent = !vs.some(function (v) { return v.available > 0; }) ? 'Sold out in this colour' : (lows.length ? 'Running low: ' + lows.map(function (v) { return v.size + ' (' + v.available + ' left)'; }).join(', ') : (out.length ? 'Crossed-out sizes are sold out' : ''));
      if (!vs.some(function (v) { return v.available > 0; })) note.className = 'stock-note bad';
    }
    var add = NL.$('#addBtn'); add.disabled = !vs.some(function (v) { return v.available > 0; });
    add.textContent = add.disabled ? 'Sold out' : (size ? 'Add to bag' : 'Select a size');
  }
  function pickColour(c) {
    colour = c; imgIdx = 0;
    var cur = variantsFor(c).filter(function (v) { return v.size === size && v.available > 0; })[0]; if (!cur) size = '';
    NL.$$('.swatch').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-c') === c); b.setAttribute('aria-pressed', b.getAttribute('data-c') === c); });
    NL.$('#colourName').textContent = c; drawGallery(); drawSizes();
  }

  function render() {
    var t = NL.trueCost(P, settings), sg = P.size_group;
    var discount = P.mrp > P.price ? Math.round((1 - P.price / P.mrp) * 100) : 0;
    root.innerHTML =
      '<div class="crumbs"><a href="/">Home</a> / <a href="/shop.html">Shop</a> / ' + NL.esc(P.name) + '</div>' +
      '<div class="pdp"><div class="gallery"><div class="thumbs" id="thumbs"></div><div class="gmain" id="gmain"></div></div>' +
      '<div class="buy"><div class="eyebrow">' + NL.esc(P.category) + (P.is_new ? ' / New' : '') + '</div><h1>' + NL.esc(P.name) + '</h1>' +
      '<div class="pr">' + NL.inr(P.price) + (P.mrp > P.price ? '<s>' + NL.inr(P.mrp) + '</s>' : '') + '</div><div class="muted" style="font-size:12.5px">Inclusive of GST' + (discount ? ' / ' + discount + '% below MRP' : '') + '</div>' +
      '<p class="lede" style="margin-top:16px;font-size:16px">' + NL.esc(P.tagline) + '</p>' +
      '<div class="opt-h"><span>Colour: <b id="colourName"></b></span></div><div class="swatches" id="swatches">' + P.colours.map(function (c) { return '<button class="swatch" data-c="' + NL.esc(c.name) + '" title="' + NL.esc(c.name) + '" aria-label="' + NL.esc(c.name) + '"><i style="background:' + NL.esc(c.hex) + '"></i></button>'; }).join('') + '</div>' +
      '<div class="opt-h"><span><b>Size</b></span><a class="link" href="#fitguide" id="fitLink">Size and fit guide</a></div><div class="sizes-grid" id="sizes" style="' + (sg === 'onesize' ? 'grid-template-columns:1fr' : '') + '"></div>' +
      '<div class="stock-note" id="stockNote" role="status"></div>' +
      '<div class="buy-actions"><button class="btn" id="addBtn">Select a size</button><button class="wishbtn' + (NL.wish.has(P.id) ? ' on' : '') + '" id="wishBtn" aria-label="Save to wishlist"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div>' +
      '<div class="opt-h" style="margin-top:28px"><b>Delivery estimate</b></div><form class="pin" id="pinForm"><input type="text" inputmode="numeric" maxlength="6" placeholder="Enter pincode" aria-label="Pincode" id="pinInput"><button class="btn ghost sm" style="height:44px" type="submit">Check</button></form><div class="pin-res" id="pinRes" role="status"></div>' +
      '<div style="margin-top:20px">' +
      '<details class="acc" open><summary>Fabric and composition</summary><div class="in"><p><b>' + NL.esc(P.fabric) + '</b><br>' + NL.esc(P.gsm) + '</p><p>' + NL.esc(P.description) + '</p><p class="muted" style="margin:0">' + NL.esc(P.origin) + '</p></div></details>' +
      '<details class="acc" id="fitguide"><summary>Fit, size chart and model</summary><div class="in"><p>' + NL.esc(P.fit) + '</p><p class="muted">' + NL.esc(P.model_info) + '</p>' + window.NL_chartHTML(sg) + '<p style="margin-top:10px"><a class="link" href="/size-guide.html">Full size guide</a></p></div></details>' +
      '<details class="acc"><summary>Care</summary><div class="in">' + NL.esc(P.care) + '</div></details>' +
      '<details class="acc"><summary>Delivery, COD and returns</summary><div class="in"><p>Free shipping above ' + NL.inr(Number(settings.free_shipping_threshold || 199900)) + ', otherwise ' + NL.inr(Number(settings.shipping_standard_fee || 7900)) + '. Cash on delivery is available on most pincodes for orders up to ' + NL.inr(Number(settings.cod_max_order || 500000)) + ' (fee ' + NL.inr(Number(settings.cod_fee || 4900)) + '). UPI orders have no fee.</p><p style="margin:0">Return unworn pieces within 7 days of delivery.</p></div></details>' +
      '</div></div></div>' +
      '<section class="section rule" style="padding-block:56px" aria-label="True cost"><div class="tc-grid"><div class="tc-copy"><div class="eyebrow">True cost</div><h2 class="h2" style="margin:12px 0 14px;font-size:clamp(26px,3vw,40px)">Where the <em>' + NL.inr(P.price) + '</em> goes</h2><p class="muted">The honest split for this piece. Our margin is the last line.</p></div><div class="tc-panel">' + NL.trueCostHTML(t) + '</div></div></section>' +
      '<section class="section rule" style="padding-block:56px" id="look" hidden><div class="section-head"><div><div class="eyebrow">Wear it with</div><h2 class="h2" style="font-size:clamp(26px,3vw,40px)">Complete the <em>look</em></h2></div></div><div class="grid" id="lookGrid"></div></section>' +
      '<section class="section rule" style="padding-block:56px" id="recent" hidden><div class="section-head"><div><div class="eyebrow">Your trail</div><h2 class="h2" style="font-size:clamp(26px,3vw,40px)">Recently <em>viewed</em></h2></div></div><div class="grid" id="recentGrid"></div></section>';
    document.title = P.name + ' - NORTHLOOM';
    var firstIn = P.colours.filter(function (c) { return variantsFor(c.name).some(function (v) { return v.available > 0; }); })[0] || P.colours[0];
    var qc = new URLSearchParams(location.search).get('colour');
    pickColour(qc && P.colours.some(function (c) { return c.name === qc; }) ? qc : firstIn.name);
    bind(); pin(); extras();
    if (window.applyWhiteLabel) window.applyWhiteLabel();
  }

  function bind() {
    NL.$('#swatches').addEventListener('click', function (e) { var b = e.target.closest('.swatch'); if (b) pickColour(b.getAttribute('data-c')); });
    NL.$('#thumbs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { imgIdx = Number(b.getAttribute('data-i')); drawGallery(); } });
    NL.$('#sizes').addEventListener('click', function (e) { var b = e.target.closest('.size-btn'); if (!b || b.disabled) return; size = b.getAttribute('data-size'); drawSizes(); });
    NL.$('#addBtn').addEventListener('click', function () {
      if (!size) { NL.toast('Please select a size first', true); NL.$('#sizes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      var v = variantsFor(colour).filter(function (x) { return x.size === size; })[0];
      var inBag = (NL.cart.items().filter(function (i) { return i.sku === v.sku; })[0] || { qty: 0 }).qty;
      if (inBag + 1 > v.available) { NL.toast('Only ' + v.available + ' available - you already have ' + inBag + ' in your bag', true); return; }
      NL.cart.add(v.sku, 1); NL.openDrawer();
    });
    NL.$('#wishBtn').addEventListener('click', function () { var on = NL.wish.toggle(P.id); this.classList.toggle('on', on); NL.toast(on ? 'Saved to wishlist' : 'Removed from wishlist'); });
    NL.$('#fitLink').addEventListener('click', function () { NL.$('#fitguide').open = true; });
  }
  function pin() {
    var inp = NL.$('#pinInput'), res = NL.$('#pinRes'), saved = NL.store.get('nl_pin', '');
    function check(p) {
      if (!/^[1-9]\d{5}$/.test(p)) { res.style.color = 'var(--bad)'; res.textContent = 'Enter a valid 6-digit pincode'; return; }
      NL.api('pincode/' + p).then(function (r) {
        if (!r.serviceable) { res.style.color = 'var(--bad)'; res.textContent = r.reason; return; }
        var d = new Date(Date.now() + r.eta_days * 864e5);
        res.style.color = 'var(--ok)';
        res.textContent = 'Delivers to ' + r.city + ' by ' + d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + (r.cod ? ' / Cash on delivery available' : ' / UPI only for this pincode');
        NL.store.set('nl_pin', p);
      }).catch(function (e) { res.textContent = e.message; });
    }
    if (saved) { inp.value = saved; check(saved); }
    NL.$('#pinForm').addEventListener('submit', function (e) { e.preventDefault(); check(inp.value.trim()); });
  }
  function extras() {
    var look = all.filter(function (p) { return p.id !== P.id && p.category !== P.category && p.collections.some(function (c) { return P.collections.indexOf(c) > -1; }); }).slice(0, 4);
    if (look.length) { NL.$('#look').hidden = false; NL.$('#lookGrid').innerHTML = look.map(NL.card).join(''); }
    var rec = NL.recent.list().filter(function (id) { return id !== P.id; }).map(function (id) { return all.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean).slice(0, 4);
    if (rec.length) { NL.$('#recent').hidden = false; NL.$('#recentGrid').innerHTML = rec.map(NL.card).join(''); }
    NL.recent.push(P.id);
    if (window.applyWhiteLabel) window.applyWhiteLabel();
  }

  Promise.all([NL.api('products/' + encodeURIComponent(slug)), NL.config(), NL.products()]).then(function (r) {
    P = r[0].product; settings = r[1].settings || {}; all = r[2]; render();
    // live stock refresh
    setInterval(function () {
      if (document.hidden) return;
      NL.api('products/' + encodeURIComponent(slug)).then(function (d) { P.variants = d.product.variants; drawSizes(); }).catch(function () {});
    }, 15000);
  }).catch(function (e) {
    root.innerHTML = '<div class="empty" style="padding-block:96px"><h3>' + (e.status === 404 ? 'We could not find that piece' : 'Could not load this product') + '</h3><p>' + NL.esc(e.message) + '</p><a class="btn" href="/shop.html">Back to shop</a></div>';
  });
})();
