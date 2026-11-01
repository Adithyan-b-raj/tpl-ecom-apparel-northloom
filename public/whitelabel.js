/**
 * White-label URL personaliser (shared showroom contract).
 * Supports ?brand= &tagline= &primary= &dark= &bg= &wa= &phone= &logo= &reset_wl=1
 * Persists in sessionStorage and is propagated across storefront and admin links.
 */
(function () {
  var KEY = 'bmad_wl_config_v1';
  var hex = function (v) { var c = String(v || '').trim().replace(/^#/, ''); return /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? '#' + c : ''; };
  var digits = function (v) { return String(v || '').replace(/[^0-9]/g, ''); };

  function load() {
    var p = new URLSearchParams(window.location.search);
    if (p.get('reset_wl') === '1') { try { sessionStorage.removeItem(KEY); } catch (e) {} return {}; }
    var s = {};
    try { s = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
    if (p.has('brand')) s.brand = p.get('brand').trim();
    if (p.has('tagline')) s.tagline = p.get('tagline').trim();
    if (p.has('primary')) s.primary = hex(p.get('primary'));
    if (p.has('dark')) s.dark = hex(p.get('dark'));
    if (p.has('bg')) s.bg = hex(p.get('bg'));
    if (p.has('wa')) s.wa = digits(p.get('wa'));
    if (p.has('phone')) s.wa = digits(p.get('phone'));
    if (p.has('logo')) s.logo = p.get('logo').trim();
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  var cfg = (window.__WL_CONFIG = load());

  function vars(c) {
    var r = document.documentElement; if (!r) return;
    if (c.primary) { r.style.setProperty('--color-primary', c.primary); r.style.setProperty('--brand-primary', c.primary); r.style.setProperty('--accent', c.primary); r.style.setProperty('--accent-ink', c.primary); }
    if (c.dark) { r.style.setProperty('--color-dark', c.dark); r.style.setProperty('--brand-dark', c.dark); }
    if (c.bg) { r.style.setProperty('--bg-main', c.bg); r.style.setProperty('--bg-canvas', c.bg); }
  }

  function splitBrand(el, text) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var parts = text.split(/\s+/);
    el.appendChild(document.createTextNode(parts[0]));
    if (parts.length > 1) { var s = document.createElement('span'); s.textContent = parts.slice(1).join(' '); el.appendChild(s); }
  }

  function apply() {
    var c = window.__WL_CONFIG || {};
    vars(c);
    var hasLogo = c.logo && /^https?:\/\//i.test(c.logo);
    if (c.brand || hasLogo) {
      document.querySelectorAll('.brand-logo').forEach(function (el) {
        if (hasLogo) {
          while (el.firstChild) el.removeChild(el.firstChild);
          var img = document.createElement('img'); img.src = c.logo; img.alt = c.brand || 'Logo';
          img.style.maxHeight = '32px'; img.style.width = 'auto'; img.style.display = 'block'; el.appendChild(img);
        } else splitBrand(el, c.brand.toUpperCase());
      });
    }
    if (c.brand) {
      var adm = location.pathname.indexOf('admin') > -1;
      document.title = c.brand + (adm ? ' - Order & Stock Admin' : ' - Everyday Basics');
      document.querySelectorAll('.mobile-brand, .sidebar-brand-title').forEach(function (el) { splitBrand(el, c.brand.toUpperCase()); });
      document.querySelectorAll('[data-wl-brand]').forEach(function (el) { el.textContent = c.brand; });
      var inp = document.getElementById('adminBrandInput'); if (inp && !inp.dataset.touched) inp.value = c.brand;
    }
    if (c.tagline) document.querySelectorAll('[data-wl-tagline]').forEach(function (el) { el.textContent = c.tagline; });
    if (c.primary) { var pi = document.getElementById('adminPrimaryInput'); if (pi && !pi.dataset.touched) pi.value = c.primary; }
    if (c.wa) {
      var b = document.getElementById('floatingWaBtn');
      if (b) b.href = 'https://wa.me/' + c.wa + '?text=' + encodeURIComponent('Hi ' + (c.brand || 'Northloom') + ', I have a question about an order.');
      var d = document.getElementById('drawerWaText');
      if (d) d.textContent = 'Support: ' + (c.wa.length === 12 ? '+' + c.wa.slice(0, 2) + ' ' + c.wa.slice(2, 7) + ' ' + c.wa.slice(7) : '+' + c.wa);
      var wi = document.getElementById('adminWaInput'); if (wi && !wi.dataset.touched) wi.value = c.wa;
    }
    // propagate through internal navigation
    var qs = new URLSearchParams();
    ['brand', 'tagline', 'primary', 'dark', 'bg', 'wa', 'logo'].forEach(function (k) { if (c[k]) qs.set(k, c[k]); });
    var q = qs.toString();
    if (q) document.querySelectorAll('a[href^="/"], a[href$=".html"]').forEach(function (a) {
      var h = a.getAttribute('href'); if (!h || /^(https?:|mailto:|tel:|#)/.test(h) || a.dataset.wlDone) return;
      var hashAt = h.indexOf('#'), hash = hashAt > -1 ? h.slice(hashAt) : '', base = hashAt > -1 ? h.slice(0, hashAt) : h;
      if (base.indexOf('brand=') > -1) return;
      a.setAttribute('href', base + (base.indexOf('?') > -1 ? '&' : '?') + q + hash); a.dataset.wlDone = '1';
    });
  }
  window.applyWhiteLabel = apply;
  vars(cfg);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  window.addEventListener('load', apply);
  setTimeout(apply, 700);
})();
