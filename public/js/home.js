(function () {
  var NL = window.NL;
  // hero rotator
  var imgs = NL.$$('#heroStage img'), dots = NL.$$('#heroDots button'), i = 0, timer;
  function show(n) {
    i = (n + imgs.length) % imgs.length;
    imgs.forEach(function (im, k) { im.classList.toggle('on', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    NL.$('#heroCount').textContent = '0' + (i + 1) + ' / 0' + imgs.length;
  }
  function start() { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(function () { show(i + 1); }, 5500); }
  dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); start(); }); });
  start();
  [1, 2, 3].forEach(function (n) { var el = NL.$('#s' + n); if (el) el.innerHTML = NL.stars(5); });
  NL.newsletter(NL.$('#newsForm'));

  var grid = NL.$('#newGrid'); grid.innerHTML = NL.skeletonGrid(4);
  Promise.all([NL.products(), NL.config()]).then(function (r) {
    var ps = r[0], s = r[1].settings;
    ['Women', 'Men', 'Basics', 'New'].forEach(function (c) {
      var n = ps.filter(function (p) { return p.collections.indexOf(c) > -1; }).length; var el = NL.$('#n-' + c); if (el) el.textContent = n + ' pieces';
    });
    var fresh = ps.filter(function (p) { return p.is_new; }).slice(0, 4);
    if (fresh.length < 4) fresh = fresh.concat(ps.filter(function (p) { return !p.is_new; })).slice(0, 4);
    grid.innerHTML = fresh.map(NL.card).join('');
    // true cost
    var pick = ['linen-shirt', 'organic-tee', 'pleated-chino', 'wrap-midi-dress', 'oversized-hoodie'].map(function (id) { return ps.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
    var tabs = NL.$('#tcTabs'), body = NL.$('#tcBody');
    function draw(k) {
      NL.$$('.tc-tab', tabs).forEach(function (b, j) { b.classList.toggle('on', j === k); b.setAttribute('aria-selected', j === k); });
      body.innerHTML = NL.trueCostHTML(NL.trueCost(pick[k], s));
    }
    tabs.innerHTML = pick.map(function (p, k) { return '<button class="tc-tab" role="tab" data-k="' + k + '">' + NL.esc(p.name) + '</button>'; }).join('');
    tabs.addEventListener('click', function (e) { var b = e.target.closest('.tc-tab'); if (b) draw(Number(b.getAttribute('data-k'))); });
    if (pick.length) draw(0);
    if (window.applyWhiteLabel) window.applyWhiteLabel();
  }).catch(function () { grid.innerHTML = '<p class="muted">We could not load the catalogue right now. Please refresh.</p>'; });
})();
