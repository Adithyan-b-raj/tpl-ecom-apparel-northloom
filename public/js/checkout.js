/**
 * NORTHLOOM Checkout Runtime
 * Handles 2-step checkout, pincode serviceability, COD / UPI selection, dynamic QR generation, and UTR submission.
 */
(function () {
  'use strict';
  var NL = window.NL;
  if (!NL) return;

  var currentQuote = null;
  var timerInterval = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    NL.mountChrome();

    var items = NL.cart.items();
    if (!items || !items.length) {
      var grid = NL.$('#checkoutGrid');
      var emp = NL.$('#emptyCartView');
      if (grid) grid.style.display = 'none';
      if (emp) emp.style.display = 'block';
      return;
    }

    // Load config (states, settings)
    try {
      var cfg = await NL.config();
      populateStates(cfg.states || []);
      if (cfg.settings && cfg.settings.cod_fee) {
        var fee = Math.round(cfg.settings.cod_fee / 100);
        var feeBadge = NL.$('#codFeeBadge');
        if (feeBadge) feeBadge.textContent = '+₹' + fee;
        var sumCodFee = NL.$('#sumCodFee');
        if (sumCodFee) sumCodFee.textContent = '₹' + fee;
      }
    } catch (e) {
      console.warn('Config load error', e);
    }

    setupEventListeners();
    await refreshQuote();
  }

  function populateStates(states) {
    var sel = NL.$('#selState');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select State / UT</option>' +
      states.map(function (s) { return '<option value="' + NL.esc(s.name) + '">' + NL.esc(s.name) + '</option>'; }).join('');
  }

  function setupEventListeners() {
    // Payment method switch
    var optUpi = NL.$('#optUpi');
    var optCod = NL.$('#optCod');
    var payUpi = NL.$('#payUpi');
    var payCod = NL.$('#payCod');

    if (optUpi && optCod) {
      optUpi.addEventListener('click', function () {
        payUpi.checked = true;
        optUpi.classList.add('on');
        optCod.classList.remove('on');
        refreshQuote();
      });
      optCod.addEventListener('click', function () {
        if (optCod.classList.contains('disabled')) return;
        payCod.checked = true;
        optCod.classList.add('on');
        optUpi.classList.remove('on');
        refreshQuote();
      });
    }

    // Pincode auto-check
    var inpPin = NL.$('#inpPin');
    if (inpPin) {
      inpPin.addEventListener('input', function () {
        var v = inpPin.value.replace(/\D/g, '').slice(0, 6);
        inpPin.value = v;
        if (v.length === 6) {
          checkPincode(v);
        } else {
          var pinStatus = NL.$('#pinStatus');
          if (pinStatus) pinStatus.innerHTML = '';
        }
      });
    }

    // Coupon apply
    var applyBtn = NL.$('#applyCouponBtn');
    var couponInp = NL.$('#couponInput');
    if (applyBtn && couponInp) {
      var savedCoupon = NL.cart.coupon();
      if (savedCoupon) couponInp.value = savedCoupon;

      applyBtn.addEventListener('click', async function () {
        var code = couponInp.value.trim().toUpperCase();
        if (!code) {
          NL.cart.setCoupon('');
          await refreshQuote();
          showCouponMsg('Coupon removed', false);
          return;
        }
        try {
          var res = await NL.api('coupon/validate', {
            method: 'POST',
            body: { code: code, subtotal: currentQuote ? currentQuote.subtotal : 0 }
          });
          NL.cart.setCoupon(res.code);
          await refreshQuote();
          showCouponMsg('Applied: ' + res.code + ' (-' + NL.inr(res.discount) + ')', true);
        } catch (e) {
          showCouponMsg(e.message || 'Invalid coupon', false);
        }
      });
    }

    // Checkout form submit
    var form = NL.$('#checkoutForm');
    if (form) {
      form.addEventListener('submit', handleCheckoutSubmit);
    }
  }

  function showCouponMsg(text, isOk) {
    var el = NL.$('#couponMsg');
    if (!el) return;
    el.textContent = text;
    el.style.color = isOk ? 'var(--ok)' : 'var(--bad)';
  }

  var lastCheckedPin = '';
  async function checkPincode(pin) {
    if (pin === lastCheckedPin) return;
    lastCheckedPin = pin;
    var pinStatus = NL.$('#pinStatus');
    var optCod = NL.$('#optCod');
    var payUpi = NL.$('#payUpi');
    var payCod = NL.$('#payCod');

    if (pinStatus) pinStatus.innerHTML = '<span class="muted">Checking serviceability...</span>';

    try {
      var info = await NL.api('pincode/' + pin);
      if (!info.serviceable) {
        if (pinStatus) pinStatus.innerHTML = '<span style="color:var(--bad)">Sorry, we do not deliver to pincode ' + pin + ' yet.</span>';
        if (optCod) optCod.classList.add('disabled');
        return;
      }

      // Auto-fill city and state if empty
      var inpCity = NL.$('#inpCity');
      var selState = NL.$('#selState');
      if (inpCity && !inpCity.value && info.city) inpCity.value = info.city;
      if (selState && !selState.value && info.state) {
        for (var i = 0; i < selState.options.length; i++) {
          if (selState.options[i].value.toLowerCase() === info.state.toLowerCase()) {
            selState.selectedIndex = i;
            break;
          }
        }
      }

      if (pinStatus) {
        pinStatus.innerHTML = '<span style="color:var(--ok)">&#10003; Serviceable in ' + NL.esc(info.city) + ', ' + NL.esc(info.state) + ' (ETA ~' + (info.eta_days || 3) + ' days)</span>';
      }

      // Check COD availability
      if (info.cod === false) {
        if (optCod) {
          optCod.classList.add('disabled');
          var d = optCod.querySelector('.d');
          if (d) d.textContent = 'Cash on Delivery is unavailable for this pincode.';
        }
        if (payCod && payCod.checked) {
          if (payUpi) payUpi.checked = true;
          if (optUpi) optUpi.classList.add('on');
          if (optCod) optCod.classList.remove('on');
        }
      } else {
        if (optCod) {
          optCod.classList.remove('disabled');
          var desc = optCod.querySelector('.d');
          if (desc) desc.textContent = 'Pay cash at your doorstep. Verified with phone confirmation. ₹49 handling fee applies. Maximum order ₹5,000.';
        }
      }

      await refreshQuote();
    } catch (e) {
      if (pinStatus) pinStatus.innerHTML = '<span class="muted">Could not verify pincode</span>';
    }
  }

  async function refreshQuote() {
    var payCod = NL.$('#payCod');
    var isCod = payCod && payCod.checked;
    var inpPin = NL.$('#inpPin');
    var pinVal = inpPin ? inpPin.value.trim() : '';

    try {
      var q = await NL.cart.quote({
        payment_method: isCod ? 'cod' : 'upi',
        pincode: pinVal.length === 6 ? pinVal : undefined
      });
      if (!q) return;
      currentQuote = q;
      renderSummary(q);
    } catch (e) {
      console.warn('Quote error:', e);
    }
  }

  function renderSummary(q) {
    // Summary lines
    var linesEl = NL.$('#summaryLines');
    if (linesEl && q.lines) {
      linesEl.innerHTML = q.lines.map(function (l) {
        var imgHtml = l.image ? '<img src="' + NL.esc(l.image) + '" alt="' + NL.esc(l.name) + '" width="56" height="70">' : '';
        return (
          '<div class="sline">' +
            imgHtml +
            '<div>' +
              '<div style="font-weight:500">' + NL.esc(l.name) + '</div>' +
              '<div class="muted" style="font-size:12.5px">' + NL.esc(l.colour) + ' &bull; Size ' + NL.esc(l.size) + ' &bull; Qty ' + l.qty + '</div>' +
            '</div>' +
            '<div style="font-weight:500">' + NL.inr(l.line_total) + '</div>' +
          '</div>'
        );
      }).join('');
    }

    // Totals
    var subEl = NL.$('#sumSubtotal');
    if (subEl) subEl.textContent = NL.inr(q.subtotal);

    var discRow = NL.$('#discountRow');
    var discVal = NL.$('#sumDiscount');
    var discCode = NL.$('#discountCode');
    if (discRow && discVal && discCode) {
      if (q.discount > 0) {
        discRow.style.display = 'flex';
        discVal.textContent = '-' + NL.inr(q.discount);
        discCode.textContent = q.coupon || '';
      } else {
        discRow.style.display = 'none';
      }
    }

    var shipEl = NL.$('#sumShipping');
    if (shipEl) shipEl.textContent = q.shipping_fee > 0 ? NL.inr(q.shipping_fee) : 'Free';

    var codRow = NL.$('#codFeeRow');
    if (codRow) codRow.style.display = q.cod_fee > 0 ? 'flex' : 'none';

    var totEl = NL.$('#sumTotal');
    if (totEl) totEl.textContent = NL.inr(q.total);

    var btnTot = NL.$('#btnTotalText');
    if (btnTot) btnTot.textContent = NL.inr(q.total);

    // Check COD order max limit
    var optCod = NL.$('#optCod');
    var payUpi = NL.$('#payUpi');
    var payCod = NL.$('#payCod');
    if (optCod && payCod && q.total > 500000) {
      optCod.classList.add('disabled');
      var d = optCod.querySelector('.d');
      if (d) d.textContent = 'Cash on Delivery is only available for orders up to ₹5,000.';
      if (payCod.checked && payUpi) {
        payUpi.checked = true;
        optCod.classList.remove('on');
        var optUpi = NL.$('#optUpi');
        if (optUpi) optUpi.classList.add('on');
        refreshQuote();
      }
    }
  }

  async function handleCheckoutSubmit(ev) {
    ev.preventDefault();
    var errEl = NL.$('#checkoutErr');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    var form = ev.target;
    var name = (form.customer_name.value || '').trim();
    var phone = (form.phone.value || '').replace(/\D/g, '');
    var email = (form.email.value || '').trim();
    var addr1 = (form.address_line1.value || '').trim();
    var addr2 = (form.address_line2.value || '').trim();
    var pin = (form.pincode.value || '').replace(/\D/g, '');
    var city = (form.city.value || '').trim();
    var state = form.state.value;
    var pay = form.payment_method.value;
    var notes = (form.notes.value || '').trim();

    // Validation
    if (!name) return showError('Please enter your full name');
    if (!/^[6-9]\d{9}$/.test(phone)) return showError('Please enter a valid 10-digit Indian mobile number');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError('Please enter a valid email address');
    if (!addr1) return showError('Please enter your street address');
    if (!/^[1-9]\d{5}$/.test(pin)) return showError('Please enter a valid 6-digit pincode');
    if (!city) return showError('Please enter your city');
    if (!state) return showError('Please select your state');

    var btn = NL.$('#placeOrderBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing order...'; }

    var payload = {
      customer_name: name,
      phone: phone,
      email: email,
      address_line1: addr1,
      address_line2: addr2,
      city: city,
      state: state,
      pincode: pin,
      payment_method: pay,
      coupon: NL.cart.coupon() || undefined,
      notes: notes || undefined,
      items: NL.cart.items()
    };

    try {
      var res = await NL.api('orders', { method: 'POST', body: payload });
      var order = res.order;
      NL.cart.clear();
      showOrderConfirmation(order);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Place order &bull; <span id="btnTotalText">' + (currentQuote ? NL.inr(currentQuote.total) : '...') + '</span>'; }
      showError(e.message || 'Could not place order. Please review your details and retry.');
    }
  }

  function showError(msg) {
    var errEl = NL.$('#checkoutErr');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      NL.toast(msg, true);
    }
  }

  function showOrderConfirmation(order) {
    var grid = NL.$('#checkoutGrid');
    var post = NL.$('#postOrderView');
    if (grid) grid.style.display = 'none';
    if (post) post.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    var custEl = NL.$('#postCustName');
    if (custEl) custEl.textContent = order.customer_name;

    var idEl = NL.$('#postOrderId');
    if (idEl) idEl.textContent = order.id;

    // Track order and invoice links
    var trackBtn = NL.$('#trackOrderBtn');
    if (trackBtn) trackBtn.href = '/track.html?id=' + encodeURIComponent(order.id) + '&phone=' + encodeURIComponent(order.phone);

    var invBtn = NL.$('#downloadInvoiceBtn');
    if (invBtn) invBtn.href = '/api/orders/' + encodeURIComponent(order.id) + '/invoice?phone=' + encodeURIComponent(order.phone) + '&download=1';

    // Summary lines
    var postLines = NL.$('#postOrderLines');
    if (postLines && order.items) {
      postLines.innerHTML = order.items.map(function (it) {
        return (
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--rule);font-size:14px">' +
            '<div><b>' + NL.esc(it.name) + '</b> <span class="muted">(' + NL.esc(it.colour) + ', ' + NL.esc(it.size) + ') &times; ' + it.qty + '</span></div>' +
            '<div>' + NL.inr(it.line_total) + '</div>' +
          '</div>'
        );
      }).join('');
    }

    var postTot = NL.$('#postTotalText');
    if (postTot) postTot.textContent = NL.inr(order.total);

    var postAddr = NL.$('#postShippingAddress');
    if (postAddr) {
      postAddr.innerHTML = '<b>Delivering to:</b> ' + NL.esc(order.address_line1) + (order.address_line2 ? ', ' + NL.esc(order.address_line2) : '') + ', ' + NL.esc(order.city) + ', ' + NL.esc(order.state) + ' - ' + NL.esc(order.pincode) + ' &bull; Phone: +91 ' + NL.esc(order.phone);
    }

    // COD vs UPI presentation
    if (order.payment_method === 'cod') {
      var codStage = NL.$('#codConfirmStage');
      if (codStage) codStage.style.display = 'block';
      var codAmt = NL.$('#codAmountText');
      if (codAmt) codAmt.textContent = NL.inr(order.total);
    } else {
      setupUpiPaymentStage(order);
    }
  }

  function setupUpiPaymentStage(order) {
    var upiStage = NL.$('#upiPaymentStage');
    if (!upiStage) return;
    upiStage.style.display = 'block';

    var upi = order.upi || {};
    var link = upi.link || ('upi://pay?pa=' + encodeURIComponent(upi.vpa || 'merchant@upi') + '&am=' + (order.total / 100).toFixed(2) + '&tn=' + encodeURIComponent(order.id) + '&cu=INR');

    // Dynamic QR Code SVG
    var qrBox = NL.$('#qrContainer');
    if (qrBox && window.generateQRSVG) {
      qrBox.innerHTML = window.generateQRSVG(link, 2);
    }

    var amtEl = NL.$('#upiAmountText');
    if (amtEl) amtEl.textContent = NL.inr(order.total);

    var vpaEl = NL.$('#upiVpaText');
    if (vpaEl) vpaEl.textContent = upi.vpa || 'merchant@upi';

    var merEl = NL.$('#upiMerchantText');
    if (merEl) merEl.textContent = upi.merchant || 'NORTHLOOM';

    var refEl = NL.$('#upiRefText');
    if (refEl) refEl.textContent = order.id;

    var intentBtn = NL.$('#upiIntentBtn');
    if (intentBtn) intentBtn.href = link;

    // Copy VPA button
    var copyBtn = NL.$('#copyVpaBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var vpa = upi.vpa || 'merchant@upi';
        navigator.clipboard.writeText(vpa).then(function () {
          NL.toast('UPI ID copied to clipboard');
        }).catch(function () {
          NL.toast(vpa);
        });
      });
    }

    // Reservation timer (30 minutes)
    var timerEl = NL.$('#upiTimer');
    var expiresAt = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + 30 * 60000;
    if (timerEl) {
      clearInterval(timerInterval);
      function updateTimer() {
        var diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        var mins = Math.floor(diff / 60);
        var secs = diff % 60;
        timerEl.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
        if (diff <= 0) {
          clearInterval(timerInterval);
          timerEl.textContent = 'EXPIRED';
          timerEl.style.color = 'var(--bad)';
        }
      }
      updateTimer();
      timerInterval = setInterval(updateTimer, 1000);
    }

    // UTR submission
    var utrBtn = NL.$('#submitUtrBtn');
    var utrInp = NL.$('#utrInput');
    var utrStatus = NL.$('#utrStatus');
    if (utrBtn && utrInp) {
      utrBtn.addEventListener('click', async function () {
        var utrVal = utrInp.value.replace(/\D/g, '').trim();
        if (utrVal.length !== 12) {
          if (utrStatus) utrStatus.innerHTML = '<span style="color:var(--bad)">Please enter a valid 12-digit UTR reference number</span>';
          return;
        }
        utrBtn.disabled = true;
        utrBtn.textContent = 'Submitting...';
        try {
          await NL.api('orders/' + encodeURIComponent(order.id) + '/utr', {
            method: 'POST',
            body: { phone: order.phone, utr: utrVal }
          });
          if (utrStatus) {
            utrStatus.innerHTML = '<span style="color:var(--ok)">&#10003; UTR ' + NL.esc(utrVal) + ' submitted! Our team is verifying your payment. Your order is reserved.</span>';
          }
          utrInp.disabled = true;
          utrBtn.style.display = 'none';
          NL.toast('Payment reference submitted successfully');
        } catch (e) {
          utrBtn.disabled = false;
          utrBtn.textContent = 'Submit UTR';
          if (utrStatus) utrStatus.innerHTML = '<span style="color:var(--bad)">' + NL.esc(e.message || 'Failed to submit UTR') + '</span>';
        }
      });
    }
  }
})();
