(function () {
  var NL = window.NL, all = [], st = { collection: '', size: '', colour: '', price: '', sort: 'featured', wishlist: false };
  var q = new URLSearchParams(location.search);
  st.collection = q.get('collection') || ''; st.wishlist = q.get('wishlist') === '1'; st.sort = q.get('sort') || 'featured';
  var PRICES = [['', 'Any'], ['0-1500', 'Under \u20B91,500'], ['1500-2500', '\u20B91,500 - 2,500'], ['2500-99999', 'Over \u20B92,500']];
  var grid = NL.$('#grid'); grid.innerHTML = NL.skeletonGrid(6);

  function opts(el, list, key, labelFn) {
    el.innerHTML = list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<button class="fopt' + (st[key] === v ? ' on' : '') + '" data-k="' + key + '" data-v="' + NL.esc(v) + '">' + (labelFn ? labelFn(v, l) : NL.esc(l)) + '</button>'; }).join('');
  }
  function filtered() {
    var r = all.filter(function (p) {
      if (st.wishlist && !NL.wish.has(p.id)) return false;
      if (st.collection && p.collections.indexOf(st.collection) < 0) return false;
      if (st.size && !p.variants.some(function (v) { return v.size === st.size && v.available > 0; })) return false;
      if (st.colour && !p.colours.some(function (c) { return c.name === st.colour; })) return false;
      if (st.price) { var b = st.price.split('-').map(Number), rs = p.price / 100; if (rs < b[0] || rs > b[1]) return false; }
      return true;
    });
    if (st.sort === 'plh') r.sort(function (a, b) { return a.price - b.price; });
    else if (st.sort === 'phl') r.sort(function (a, b) { return b.price - a.price; });
    else if (st.sort === 'new') r.sort(function (a, b) { return (b.is_new ? 1 : 0) - (a.is_new ? 1 : 0); });
    return r;
  }
  function render() {
    opts(NL.$('#fCol'), [['', 'All']].concat(['Women', 'Men', 'Basics', 'New'].map(function (c) { return [c, c]; })), 'collection');
    var sizes = {}, colours = {};
    all.forEach(function (p) { p.variants.forEach(function (v) { if (v.size !== 'OS') sizes[v.size] = 1; }); p.colours.forEach(function (c) { colours[c.name] = c.hex; }); });
    opts(NL.$('#fSize'), [['', 'Any']].concat(Object.keys(sizes).sort(NL.sizeSort).map(function (s) { return [s, s]; })), 'size');
    opts(NL.$('#fColour'), [['', 'Any']].concat(Object.keys(colours).map(function (c) { return [c, c]; })), 'colour', function (v, l) { return (v ? '<span class="dot" style="background:' + NL.esc(colours[v]) + '"></span>' : '') + NL.esc(l); });
    opts(NL.$('#fPrice'), PRICES, 'price');
    NL.$('#sortSel').value = st.sort;
    var list = filtered();
    NL.$('#resCount').textContent = list.length + (list.length === 1 ? ' piece' : ' pieces');
    NL.$('#shopTitle').innerHTML = st.wishlist ? 'Your <em>wishlist</em>' : (st.collection ? NL.esc(st.collection) + ' <em>edit</em>' : 'All <em>pieces</em>');
    NL.$('#shopEyebrow').textContent = st.wishlist ? 'Saved' : 'Shop';
    document.title = (st.collection || 'Shop') + ' - NORTHLOOM';
    grid.innerHTML = list.length ? list.map(NL.card).join('') : '<div class="empty" style="grid-column:1/-1"><h3>Nothing matches those filters</h3><p>' + (st.wishlist ? 'Tap the heart on any piece to save it here.' : 'Try clearing a filter or two.') + '</p><button class="btn ghost" id="emptyReset">Clear filters</button></div>';
    var er = NL.$('#emptyReset'); if (er) er.addEventListener('click', reset);
    if (window.applyWhiteLabel) window.applyWhiteLabel();
  }
  function reset() { st.collection = ''; st.size = ''; st.colour = ''; st.price = ''; st.wishlist = false; history.replaceState(null, '', location.pathname); render(); }
  NL.$('#filters').addEventListener('click', function (e) {
    var b = e.target.closest('.fopt'); if (!b) return;
    st[b.getAttribute('data-k')] = b.getAttribute('data-v'); render();
  });
  NL.$('#sortSel').addEventListener('change', function () { st.sort = this.value; render(); });
  NL.$('#fReset').addEventListener('click', reset);
  NL.$('#filterOpen').addEventListener('click', function () { NL.$('#filters').classList.add('on'); NL.$('#overlay').classList.add('on'); });
  NL.$('#filterClose').addEventListener('click', function () { NL.$('#filters').classList.remove('on'); NL.$('#overlay').classList.remove('on'); });
  document.addEventListener('click', function (e) { if (e.target.closest('.wish') && st.wishlist) setTimeout(render, 50); });
  NL.products().then(function (ps) { all = ps; render(); }).catch(function () { grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Could not load products</h3><p>Please check your connection and refresh.</p></div>'; });
})();
