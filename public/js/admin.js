/**
 * NORTHLOOM Admin & Order Operations Runtime
 * Full order lifecycle management, stock adjustment, ledger audit, and settings.
 */
(function () {
  'use strict';
  var NL = window.NL;
  if (!NL) return;

  var currentTab = 'dashboard';
  var activeOrderId = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupModals();
    setupNavigation();
    setupForms();

    // Check session
    try {
      var me = await NL.api('admin/me');
      showApp(me);
    } catch (e) {
      showLogin();
    }
  }

  function showToast(msg, isBad) {
    var t = NL.$('#adminToast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast on' + (isBad ? ' bad' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'toast' + (isBad ? ' bad' : ''); }, 2800);
  }

  async function showLogin() {
    var loginView = NL.$('#loginView');
    var appView = NL.$('#adminApp');
    if (loginView) loginView.style.display = 'block';
    if (appView) appView.style.display = 'none';

    try {
      var cfg = await NL.config();
      if (cfg.demo) {
        var hint = NL.$('#demoPwHint');
        if (hint) hint.style.display = 'block';
      }
    } catch (e) {}
  }

  function showApp(me) {
    var loginView = NL.$('#loginView');
    var appView = NL.$('#adminApp');
    if (loginView) loginView.style.display = 'none';
    if (appView) appView.style.display = 'grid';

    if (me && me.demo) {
      var resetBtn = NL.$('#resetDemoBtn');
      if (resetBtn) resetBtn.style.display = 'inline-block';
    }

    switchTab('dashboard');
  }

  function setupModals() {
    window.closeModals = function () {
      NL.$$('.modal-overlay').forEach(function (el) { el.classList.remove('open'); });
    };

    NL.$$('.modal-overlay').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        if (ev.target === el) window.closeModals();
      });
    });
  }

  function setupNavigation() {
    window.switchTab = function (tab) {
      currentTab = tab;
      NL.$$('.admin-nav-btn').forEach(function (btn) {
        if (btn.getAttribute('data-tab') === tab) btn.classList.add('active');
        else btn.classList.remove('active');
      });

      NL.$$('.admin-tab-pane').forEach(function (pane) {
        if (pane.id === 'tab-' + tab) pane.style.display = 'block';
        else pane.style.display = 'none';
      });

      var titleEl = NL.$('#tabHeaderTitle');
      var subEl = NL.$('#tabHeaderSubtitle');
      var titles = {
        dashboard: ['Dashboard', 'Operations overview and real-time order queue'],
        orders: ['Orders Management', 'Order fulfillments, dispatching, COD confirmations, and UPI verification'],
        inventory: ['Inventory & Variant Matrix', 'SKU on-hand quantities, reservations, and low stock thresholds'],
        ledger: ['Stock Ledger Audit', 'Immutable ledger log of all stock movements'],
        coupons: ['Promotional Coupons', 'Discount codes and usage statistics'],
        settings: ['Store Configuration', 'UPI VPA, shipping rules, and contact info']
      };

      if (titles[tab]) {
        if (titleEl) titleEl.textContent = titles[tab][0];
        if (subEl) subEl.textContent = titles[tab][1];
      }

      loadTabData(tab);
    };

    NL.$$('.admin-nav-btn[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-tab');
        if (t) window.switchTab(t);
      });
    });

    var refBtn = NL.$('#refreshBtn');
    if (refBtn) refBtn.addEventListener('click', function () { loadTabData(currentTab); });

    var logoutBtn = NL.$('#adminLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async function () {
      try {
        await NL.api('admin/logout', { method: 'POST' });
      } catch (e) {}
      showLogin();
    });

    var resetBtn = NL.$('#resetDemoBtn');
    if (resetBtn) resetBtn.addEventListener('click', async function () {
      if (!confirm('Reset all demo orders and restore original stock quantities?')) return;
      try {
        await NL.api('admin/reset-demo', { method: 'POST' });
        showToast('Demo data reset successfully');
        loadTabData(currentTab);
      } catch (e) {
        showToast(e.message || 'Failed to reset demo', true);
      }
    });
  }

  function setupForms() {
    // Login form
    var loginForm = NL.$('#adminLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var pw = (NL.$('#adminPw').value || '').trim();
        var err = NL.$('#loginErr');
        if (err) { err.style.display = 'none'; err.textContent = ''; }
        if (!pw) return;

        var btn = NL.$('#loginBtn');
        btn.disabled = true;
        btn.textContent = 'Signing in...';

        try {
          await NL.api('admin/login', { method: 'POST', body: { password: pw } });
          btn.disabled = false;
          btn.textContent = 'Sign in \u2192';
          var me = await NL.api('admin/me');
          showApp(me);
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'Sign in \u2192';
          if (err) { err.textContent = e.message || 'Incorrect password'; err.style.display = 'block'; }
        }
      });
    }

    // Adjust Stock Form
    var openAdjBtn = NL.$('#openAdjustStockBtn');
    if (openAdjBtn) openAdjBtn.addEventListener('click', function () {
      NL.$('#adjustForm').reset();
      NL.$('#adjustModal').classList.add('open');
    });

    var adjForm = NL.$('#adjustForm');
    if (adjForm) {
      adjForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var sku = (NL.$('#adjSku').value || '').trim().toUpperCase();
        var delta = NL.$('#adjDelta').value;
        var setTo = NL.$('#adjSetTo').value;
        var reason = NL.$('#adjReason').value;
        var note = (NL.$('#adjNote').value || '').trim();

        if (!sku) return alert('Enter a variant SKU');
        if (!reason) return alert('Select an audit reason');
        if ((delta === '' || delta === null) && (setTo === '' || setTo === null)) {
          return alert('Enter either a change delta or a set-to count');
        }

        try {
          var payload = { sku: sku, reason: reason, note: note };
          if (delta !== '') payload.delta = Number(delta);
          else if (setTo !== '') payload.set_to = Number(setTo);

          await NL.api('admin/inventory/adjust', { method: 'POST', body: payload });
          window.closeModals();
          showToast('Stock adjusted for ' + sku);
          loadTabData(currentTab);
        } catch (e) {
          alert(e.message || 'Failed to adjust stock');
        }
      });
    }

    // Ship Form
    var shipForm = NL.$('#shipForm');
    if (shipForm) {
      shipForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var oId = NL.$('#shipOrderId').value;
        var courier = NL.$('#shipCourier').value;
        var awb = (NL.$('#shipAwb').value || '').trim().toUpperCase();

        if (!courier || !awb) return alert('Enter courier name and AWB number');

        try {
          await NL.api('admin/orders/' + encodeURIComponent(oId) + '/action', {
            method: 'POST',
            body: { action: 'status', to: 'shipped', courier: courier, awb: awb }
          });
          window.closeModals();
          showToast('Order ' + oId + ' marked as Shipped via ' + courier);
          openOrderDetail(oId);
          loadTabData(currentTab);
        } catch (e) {
          alert(e.message || 'Failed to mark shipped');
        }
      });
    }

    // Add note on order detail
    var addNoteBtn = NL.$('#modAddNoteBtn');
    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', async function () {
        var noteInp = NL.$('#modNoteInp');
        var note = (noteInp.value || '').trim();
        if (!note || !activeOrderId) return;
        try {
          await NL.api('admin/orders/' + encodeURIComponent(activeOrderId) + '/action', {
            method: 'POST',
            body: { action: 'note', note: note }
          });
          noteInp.value = '';
          showToast('Note added');
          openOrderDetail(activeOrderId);
        } catch (e) {
          alert(e.message || 'Could not add note');
        }
      });
    }

    // Settings Form
    var setForm = NL.$('#settingsForm');
    if (setForm) {
      setForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var body = {
          brand_name: setForm.brand_name.value.trim(),
          upi_vpa: setForm.upi_vpa.value.trim(),
          upi_merchant_name: setForm.upi_merchant_name.value.trim(),
          free_shipping_threshold: Math.round(Number(setForm.free_shipping_threshold.value) * 100),
          cod_fee: Math.round(Number(setForm.cod_fee.value) * 100),
          cod_max_order: Math.round(Number(setForm.cod_max_order.value) * 100),
          support_phone: setForm.support_phone.value.trim(),
          support_email: setForm.support_email.value.trim()
        };
        try {
          await NL.api('admin/settings', { method: 'PUT', body: body });
          showToast('Settings saved successfully');
        } catch (e) {
          alert(e.message || 'Failed to save settings');
        }
      });
    }

    // Order filters
    var oSearch = NL.$('#orderSearchInp');
    var oStatus = NL.$('#orderStatusFilter');
    var oPay = NL.$('#orderPaymentFilter');
    if (oSearch) oSearch.addEventListener('input', debounce(function () { loadOrders(); }, 300));
    if (oStatus) oStatus.addEventListener('change', loadOrders);
    if (oPay) oPay.addEventListener('change', loadOrders);

    // Inventory filters
    var iSearch = NL.$('#invSearchInp');
    var iLow = NL.$('#invLowOnly');
    if (iSearch) iSearch.addEventListener('input', debounce(function () { loadInventory(); }, 300));
    if (iLow) iLow.addEventListener('change', loadInventory);
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function loadTabData(tab) {
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'orders') loadOrders();
    else if (tab === 'inventory') loadInventory();
    else if (tab === 'ledger') loadLedger();
    else if (tab === 'coupons') loadCoupons();
    else if (tab === 'settings') loadSettings();
  }

  async function loadDashboard() {
    try {
      var d = await NL.api('admin/dashboard');

      NL.$('#mTodayRev').textContent = NL.inr(d.today_revenue || 0);
      NL.$('#mTodayOrders').textContent = (d.today_orders || 0) + ' orders today';
      NL.$('#mPendingCod').textContent = d.pending_cod || 0;
      NL.$('#mUpiAwaiting').textContent = d.upi_awaiting || 0;
      NL.$('#mToPack').textContent = d.to_pack || 0;
      NL.$('#mToShip').textContent = d.to_ship || 0;
      NL.$('#mLowStock').textContent = d.low_stock || 0;
      NL.$('#mOutOfStock').textContent = d.out_of_stock || 0;

      // Nav badges
      var navOrd = NL.$('#navOrderCount');
      if (navOrd) navOrd.textContent = (d.pending_cod + d.upi_awaiting + d.to_pack) || '0';

      var navLow = NL.$('#navLowStockCount');
      if (navLow) {
        if (d.low_stock > 0) { navLow.style.display = 'inline-block'; navLow.textContent = d.low_stock; }
        else { navLow.style.display = 'none'; }
      }

      // Recent orders table
      var tbody = NL.$('#recentOrdersTbody');
      if (tbody) {
        if (!d.recent || !d.recent.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No orders recorded yet</td></tr>';
        } else {
          tbody.innerHTML = d.recent.map(function (o) {
            return (
              '<tr>' +
                '<td><b><a class="link" href="javascript:void(0)" onclick="window.openOrderDetail(\'' + o.id + '\')">' + o.id + '</a></b></td>' +
                '<td>' + NL.esc(o.customer_name) + '</td>' +
                '<td><b>' + NL.inr(o.total) + '</b></td>' +
                '<td><span class="badge">' + o.payment_method.toUpperCase() + '</span></td>' +
                '<td>' + statusBadge(o.status) + '</td>' +
                '<td><button type="button" class="btn ghost sm" onclick="window.openOrderDetail(\'' + o.id + '\')">Manage</button></td>' +
              '</tr>'
            );
          }).join('');
        }
      }

      // 7-day chart
      var chartBox = NL.$('#chartBars');
      if (chartBox && d.chart) {
        var maxRev = Math.max.apply(null, d.chart.map(function (x) { return x.revenue; })) || 1;
        chartBox.innerHTML = d.chart.map(function (c) {
          var pct = Math.round((c.revenue / maxRev) * 100);
          var dayStr = new Date(c.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
          return (
            '<div style="font-size:12.5px">' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
                '<span>' + dayStr + '</span>' +
                '<b>' + NL.inr(c.revenue) + ' <span class="muted">(' + c.orders + ')</span></b>' +
              '</div>' +
              '<div style="height:6px;background:var(--sand);border-radius:1px;overflow:hidden">' +
                '<div style="height:100%;background:var(--color-dark);width:' + Math.max(pct, 2) + '%"></div>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }
    } catch (e) {
      console.warn('Dashboard load error', e);
    }
  }

  function statusBadge(s) {
    var cls = 'badge';
    if (['confirmed', 'delivered'].includes(s)) cls += ' ok';
    else if (['cancelled', 'rto'].includes(s)) cls += ' bad';
    else cls += ' warn';
    return '<span class="' + cls + '">' + (s || '').replace(/_/g, ' ').toUpperCase() + '</span>';
  }

  async function loadOrders() {
    var tbody = NL.$('#ordersTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Loading orders...</td></tr>';

    var q = NL.$('#orderSearchInp').value.trim();
    var status = NL.$('#orderStatusFilter').value;
    var pay = NL.$('#orderPaymentFilter').value;

    var qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (pay) qs.set('payment', pay);

    try {
      var res = await NL.api('admin/orders' + (qs.toString() ? '?' + qs.toString() : ''));
      var orders = res.orders || [];

      var matchEl = NL.$('#orderTotalMatch');
      if (matchEl) matchEl.textContent = orders.length + ' orders';

      if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No orders matching filter</td></tr>';
        return;
      }

      tbody.innerHTML = orders.map(function (o) {
        var d = new Date(o.created_at);
        var dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return (
          '<tr>' +
            '<td><b><a class="link" href="javascript:void(0)" onclick="window.openOrderDetail(\'' + o.id + '\')">' + o.id + '</a></b></td>' +
            '<td>' + dateStr + '</td>' +
            '<td><div>' + NL.esc(o.customer_name) + '</div><div class="muted" style="font-size:12px">+91 ' + NL.esc(o.phone) + '</div></td>' +
            '<td>' + (o.units || 1) + '</td>' +
            '<td><b>' + NL.inr(o.total) + '</b></td>' +
            '<td><div><span class="badge">' + o.payment_method.toUpperCase() + '</span></div><div class="muted" style="font-size:11.5px">' + o.payment_status.replace(/_/g, ' ') + (o.utr ? ' (UTR)' : '') + '</div></td>' +
            '<td>' + statusBadge(o.status) + '</td>' +
            '<td><button type="button" class="btn ghost sm" onclick="window.openOrderDetail(\'' + o.id + '\')">Manage</button></td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:var(--bad);text-align:center;padding:24px">Failed to load orders</td></tr>';
    }
  }

  window.openOrderDetail = async function (id) {
    activeOrderId = id;
    var modal = NL.$('#orderModal');
    if (!modal) return;
    modal.classList.add('open');

    var oIdEl = NL.$('#modOrderId');
    if (oIdEl) oIdEl.textContent = id;

    try {
      var res = await NL.api('admin/orders/' + encodeURIComponent(id));
      var order = res.order;

      var dt = new Date(order.created_at);
      NL.$('#modOrderDate').textContent = 'Placed on ' + dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' &bull; Status: ' + order.status.toUpperCase();

      NL.$('#modCustInfo').innerHTML =
        '<b>' + NL.esc(order.customer_name) + '</b><br>' +
        NL.esc(order.address_line1) + (order.address_line2 ? ', ' + NL.esc(order.address_line2) : '') + '<br>' +
        NL.esc(order.city) + ', ' + NL.esc(order.state) + ' - ' + NL.esc(order.pincode) + '<br>' +
        'Phone: +91 ' + NL.esc(order.phone) + '<br>Email: ' + NL.esc(order.email);

      var payHtml = '<b>Method:</b> ' + order.payment_method.toUpperCase() + '<br><b>Status:</b> ' + order.payment_status.replace(/_/g, ' ') + '<br><b>Total:</b> ' + NL.inr(order.total);
      if (order.utr) payHtml += '<br><b>UTR:</b> <code>' + NL.esc(order.utr) + '</code>';
      if (order.courier && order.awb) payHtml += '<br><b>Courier:</b> ' + NL.esc(order.courier) + ' (AWB: ' + NL.esc(order.awb) + ')';
      NL.$('#modPayInfo').innerHTML = payHtml;

      NL.$('#modSlipLink').href = '/api/admin/orders/' + encodeURIComponent(id) + '/slip';
      NL.$('#modInvLink').href = '/api/admin/orders/' + encodeURIComponent(id) + '/invoice';

      // Items table
      var tbody = NL.$('#modItemsTbl tbody');
      if (tbody && order.items) {
        tbody.innerHTML = order.items.map(function (it) {
          return (
            '<tr>' +
              '<td><code>' + NL.esc(it.sku) + '</code></td>' +
              '<td>' + NL.esc(it.name) + '</td>' +
              '<td>' + NL.esc(it.colour) + ' / ' + NL.esc(it.size) + '</td>' +
              '<td>' + it.qty + '</td>' +
              '<td>' + NL.inr(it.unit_price) + '</td>' +
              '<td>' + it.gst_rate + '%</td>' +
              '<td><b>' + NL.inr(it.line_total) + '</b></td>' +
            '</tr>'
          );
        }).join('');
      }

      // Events timeline
      var evList = NL.$('#modEventsList');
      if (evList && order.events) {
        evList.innerHTML = order.events.map(function (e) {
          var ed = new Date(e.ts);
          return (
            '<li>' +
              '<b>' + NL.esc(e.note || e.type.replace(/_/g, ' ')) + '</b>' +
              '<small>' + ed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + ed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + (e.actor ? ' &bull; by ' + NL.esc(e.actor) : '') + '</small>' +
            '</li>'
          );
        }).join('');
      }

      // Contextual Action Buttons
      renderActionButtons(order);
    } catch (e) {
      alert(e.message || 'Could not load order details');
    }
  };

  function renderActionButtons(order) {
    var bar = NL.$('#modActionBar');
    if (!bar) return;
    bar.innerHTML = '';

    function addBtn(label, variant, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (variant || 'sm');
      b.style.fontSize = '13px';
      b.style.padding = '8px 14px';
      b.textContent = label;
      b.addEventListener('click', onClick);
      bar.appendChild(b);
    }

    var st = order.status;
    var pay = order.payment_status;
    var meth = order.payment_method;

    // COD Confirm
    if (st === 'placed' && meth === 'cod') {
      addBtn('Confirm COD with Customer', 'sm', function () { triggerAction(order.id, { action: 'cod_confirm' }); });
    }

    // UPI Verify / Reject
    if (st === 'placed' && meth === 'upi' && ['pending', 'utr_submitted'].includes(pay)) {
      addBtn('\u2713 Verify UPI Payment', 'sm', function () { triggerAction(order.id, { action: 'upi_verify' }); });
      addBtn('Reject UPI Payment', 'ghost sm', function () {
        if (confirm('Reject UPI payment and release reserved stock?')) triggerAction(order.id, { action: 'upi_reject' });
      });
    }

    // Move to Packed
    if (st === 'confirmed') {
      addBtn('Mark as Packed', 'sm', function () { triggerAction(order.id, { action: 'status', to: 'packed' }); });
    }

    // Move to Shipped (Courier + AWB modal)
    if (st === 'packed') {
      addBtn('Dispatch & Ship Parcel...', 'sm', function () {
        NL.$('#shipOrderId').value = order.id;
        NL.$('#shipModal').classList.add('open');
      });
    }

    // Move to Delivered or RTO
    if (st === 'shipped') {
      addBtn('Mark as Delivered', 'sm', function () { triggerAction(order.id, { action: 'status', to: 'delivered' }); });
      addBtn('Mark RTO (Return to Origin)', 'ghost sm', function () {
        if (confirm('Mark parcel as Returned to Origin (RTO)? Stock will be automatically restocked.')) {
          triggerAction(order.id, { action: 'status', to: 'rto' });
        }
      });
    }

    // Mark COD Cash Collected
    if (meth === 'cod' && pay === 'cod_pending' && ['shipped', 'delivered'].includes(st)) {
      addBtn('Mark Cash Collected', 'sm', function () { triggerAction(order.id, { action: 'cod_collect' }); });
    }

    // Cancel Order
    if (['placed', 'confirmed', 'packed'].includes(st)) {
      addBtn('Cancel Order', 'ghost sm', function () {
        if (confirm('Cancel this order and release stock back to available inventory?')) {
          triggerAction(order.id, { action: 'status', to: 'cancelled' });
        }
      });
    }
  }

  async function triggerAction(orderId, body) {
    try {
      await NL.api('admin/orders/' + encodeURIComponent(orderId) + '/action', {
        method: 'POST',
        body: body
      });
      showToast('Order updated');
      openOrderDetail(orderId);
      loadTabData(currentTab);
    } catch (e) {
      alert(e.message || 'Action failed');
    }
  }

  async function loadInventory() {
    var tbody = NL.$('#invTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">Loading inventory...</td></tr>';

    var q = NL.$('#invSearchInp').value.trim();
    var low = NL.$('#invLowOnly').checked ? '1' : '';

    var qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (low) qs.set('low', '1');

    try {
      var res = await NL.api('admin/inventory' + (qs.toString() ? '?' + qs.toString() : ''));
      var rows = res.variants || [];

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">No inventory rows match filter</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(function (v) {
        var isLow = v.available <= v.low_threshold;
        var statusBadge = v.available <= 0
          ? '<span class="badge bad">OUT OF STOCK</span>'
          : (isLow ? '<span class="badge warn">LOW STOCK</span>' : '<span class="badge ok">IN STOCK</span>');

        return (
          '<tr>' +
            '<td><code>' + NL.esc(v.sku) + '</code></td>' +
            '<td><b>' + NL.esc(v.name) + '</b></td>' +
            '<td>' + NL.esc(v.colour) + '</td>' +
            '<td>' + NL.esc(v.size) + '</td>' +
            '<td style="text-align:right"><b>' + v.on_hand + '</b></td>' +
            '<td style="text-align:right;color:var(--muted)">' + v.reserved + '</td>' +
            '<td style="text-align:right;font-weight:600;' + (isLow ? 'color:var(--bad)' : '') + '">' + v.available + '</td>' +
            '<td style="text-align:right;color:var(--muted)">' + v.low_threshold + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td><button type="button" class="btn ghost sm" onclick="window.quickAdjust(\'' + v.sku + '\')">Adjust</button></td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="color:var(--bad);text-align:center;padding:24px">Failed to load inventory</td></tr>';
    }
  }

  window.quickAdjust = function (sku) {
    NL.$('#adjustForm').reset();
    NL.$('#adjSku').value = sku;
    NL.$('#adjustModal').classList.add('open');
  };

  async function loadLedger() {
    var tbody = NL.$('#ledgerTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Loading ledger...</td></tr>';

    try {
      var res = await NL.api('admin/ledger');
      var rows = res.ledger || [];

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No stock ledger entries recorded yet</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(function (l) {
        var d = new Date(l.ts);
        var dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        var deltaOn = l.delta > 0 ? ('+' + l.delta) : (l.delta === 0 ? '0' : String(l.delta));
        var deltaRes = l.reserved_delta > 0 ? ('+' + l.reserved_delta) : (l.reserved_delta === 0 ? '0' : String(l.reserved_delta));

        return (
          '<tr>' +
            '<td><span class="muted" style="font-size:12px">' + dateStr + '</span></td>' +
            '<td><code>' + NL.esc(l.sku) + '</code></td>' +
            '<td style="text-align:right;font-weight:600;' + (l.delta < 0 ? 'color:var(--bad)' : (l.delta > 0 ? 'color:var(--ok)' : '')) + '">' + deltaOn + '</td>' +
            '<td style="text-align:right;color:var(--muted)">' + deltaRes + '</td>' +
            '<td><span class="badge">' + NL.esc(l.reason) + '</span></td>' +
            '<td>' + (l.order_id ? '<a class="link" href="javascript:void(0)" onclick="window.openOrderDetail(\'' + l.order_id + '\')">' + l.order_id + '</a>' : '&mdash;') + '</td>' +
            '<td><span class="muted">' + NL.esc(l.actor || '') + '</span></td>' +
            '<td>' + NL.esc(l.note || '') + '</td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:var(--bad);text-align:center;padding:24px">Failed to load ledger</td></tr>';
    }
  }

  async function loadCoupons() {
    var tbody = NL.$('#couponsTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Loading coupons...</td></tr>';

    try {
      var res = await NL.api('admin/coupons');
      var rows = res.coupons || [];

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No coupons configured</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(function (c) {
        var valStr = c.type === 'percent' ? (c.value + '%') : NL.inr(c.value);
        return (
          '<tr>' +
            '<td><b><code>' + NL.esc(c.code) + '</code></b></td>' +
            '<td>' + c.type + '</td>' +
            '<td>' + valStr + '</td>' +
            '<td>' + (c.min_subtotal > 0 ? NL.inr(c.min_subtotal) : 'None') + '</td>' +
            '<td>' + (c.max_uses || 'Unlimited') + '</td>' +
            '<td>' + (c.uses_count || 0) + '</td>' +
            '<td>' + (c.active ? '<span class="badge ok">ACTIVE</span>' : '<span class="badge bad">INACTIVE</span>') + '</td>' +
            '<td><button type="button" class="btn ghost sm" onclick="window.toggleCoupon(\'' + c.code + '\')">' + (c.active ? 'Disable' : 'Enable') + '</button></td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:var(--bad);text-align:center;padding:24px">Failed to load coupons</td></tr>';
    }
  }

  window.toggleCoupon = async function (code) {
    try {
      await NL.api('admin/coupons/' + encodeURIComponent(code), { method: 'DELETE' });
      showToast('Coupon updated');
      loadCoupons();
    } catch (e) {
      alert(e.message || 'Failed to update coupon');
    }
  };

  async function loadSettings() {
    try {
      var res = await NL.api('admin/settings');
      var s = res.settings || {};
      var form = NL.$('#settingsForm');
      if (!form) return;

      form.brand_name.value = s.brand_name || '';
      form.upi_vpa.value = s.upi_vpa || '';
      form.upi_merchant_name.value = s.upi_merchant_name || '';
      form.free_shipping_threshold.value = Math.round((s.free_shipping_threshold || 0) / 100);
      form.cod_fee.value = Math.round((s.cod_fee || 0) / 100);
      form.cod_max_order.value = Math.round((s.cod_max_order || 0) / 100);
      form.support_phone.value = s.support_phone || '';
      form.support_email.value = s.support_email || '';
    } catch (e) {
      console.warn('Settings load error', e);
    }
  }
})();
