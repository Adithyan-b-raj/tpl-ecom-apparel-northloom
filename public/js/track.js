/**
 * NORTHLOOM Order Tracking Runtime
 * Real-time order progress stepper, courier AWB info, UPI UTR fallback, and GST invoice download.
 */
(function () {
  'use strict';
  var NL = window.NL;
  if (!NL) return;

  var STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    NL.mountChrome();

    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var phone = params.get('phone');

    var inpId = NL.$('#trackOrderId');
    var inpPhone = NL.$('#trackPhone');

    if (id && inpId) inpId.value = id.trim().toUpperCase();
    if (phone && inpPhone) inpPhone.value = phone.trim().replace(/\D/g, '');

    if (id && phone) {
      lookupOrder(id.trim().toUpperCase(), phone.trim().replace(/\D/g, ''));
    }

    var form = NL.$('#trackForm');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var oId = (inpId ? inpId.value : '').trim().toUpperCase();
        var oPhone = (inpPhone ? inpPhone.value : '').trim().replace(/\D/g, '');
        if (!oId) return showError('Please enter your Order ID');
        if (!/^[6-9]\d{9}$/.test(oPhone)) return showError('Please enter a valid 10-digit mobile number');
        lookupOrder(oId, oPhone);
      });
    }
  }

  function showError(msg) {
    var err = NL.$('#trackErr');
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    } else {
      NL.toast(msg, true);
    }
  }

  function clearError() {
    var err = NL.$('#trackErr');
    if (err) {
      err.textContent = '';
      err.style.display = 'none';
    }
  }

  async function lookupOrder(id, phone) {
    clearError();
    var load = NL.$('#trackLoading');
    var view = NL.$('#orderView');
    if (load) load.style.display = 'block';
    if (view) view.style.display = 'none';

    try {
      var res = await NL.api('orders/' + encodeURIComponent(id) + '?phone=' + encodeURIComponent(phone));
      var order = res.order;
      if (load) load.style.display = 'none';
      renderOrder(order);
    } catch (e) {
      if (load) load.style.display = 'none';
      showError(e.message || 'We could not find an order with that number and phone. Please check your details.');
    }
  }

  function renderOrder(order) {
    var view = NL.$('#orderView');
    if (view) view.style.display = 'block';

    // Header info
    var title = NL.$('#orderRefTitle');
    if (title) title.textContent = order.id;

    var dateEl = NL.$('#orderDateText');
    if (dateEl && order.created_at) {
      var d = new Date(order.created_at);
      dateEl.textContent = 'Placed on ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }

    var badge = NL.$('#orderStatusBadge');
    if (badge) {
      badge.textContent = order.status.replace(/_/g, ' ').toUpperCase();
      badge.className = 'badge';
      if (['delivered', 'confirmed'].includes(order.status)) badge.classList.add('ok');
      else if (['cancelled', 'rto'].includes(order.status)) badge.classList.add('bad');
      else badge.classList.add('warn');
    }

    var payStatus = NL.$('#orderPayStatusText');
    if (payStatus) {
      var payText = order.payment_method.toUpperCase() + ' (' + order.payment_status.replace(/_/g, ' ') + ')';
      payStatus.textContent = 'Payment: ' + payText;
    }

    // Stepper vs Alert
    var stepper = NL.$('#stepperWrapper');
    var alertBox = NL.$('#orderSpecialAlert');
    var alertTitle = NL.$('#specialAlertTitle');
    var alertText = NL.$('#specialAlertText');

    if (order.status === 'cancelled') {
      if (stepper) stepper.style.display = 'none';
      if (alertBox) {
        alertBox.style.display = 'block';
        alertTitle.textContent = 'Order Cancelled';
        alertText.textContent = 'This order was cancelled. Any stock reserved for it has been returned to inventory.';
      }
    } else if (order.status === 'rto') {
      if (stepper) stepper.style.display = 'none';
      if (alertBox) {
        alertBox.style.display = 'block';
        alertTitle.textContent = 'Returned to Origin (RTO)';
        alertText.textContent = 'The parcel could not be delivered to the provided address and was returned to our fulfillment facility.';
      }
    } else {
      if (alertBox) alertBox.style.display = 'none';
      if (stepper) stepper.style.display = 'block';
      var activeIdx = STEPS.indexOf(order.status);
      STEPS.forEach(function (step, idx) {
        var el = NL.$('#step-' + step);
        if (el) {
          if (idx <= activeIdx) el.classList.add('done');
          else el.classList.remove('done');
        }
      });
    }

    // Courier Banner
    var cBanner = NL.$('#courierBanner');
    var cName = NL.$('#courierName');
    var cAwb = NL.$('#courierAwb');
    var cLink = NL.$('#courierTrackLink');
    if (order.courier && order.awb) {
      if (cBanner) cBanner.style.display = 'block';
      if (cName) cName.textContent = order.courier;
      if (cAwb) cAwb.textContent = order.awb;
      if (cLink) {
        var cl = order.courier.toLowerCase();
        if (cl.indexOf('blue') > -1) cLink.href = 'https://www.bluedart.com/tracking';
        else if (cl.indexOf('delhi') > -1) cLink.href = 'https://www.delhivery.com/track/package/' + encodeURIComponent(order.awb);
        else cLink.href = 'https://www.google.com/search?q=' + encodeURIComponent(order.courier + ' tracking ' + order.awb);
      }
    } else {
      if (cBanner) cBanner.style.display = 'none';
    }

    // Pending UPI Card
    var upiCard = NL.$('#pendingUpiCard');
    if (order.payment_method === 'upi' && order.status === 'placed' && ['pending', 'utr_submitted'].includes(order.payment_status)) {
      if (upiCard) upiCard.style.display = 'block';
      var upi = order.upi || {};
      var link = upi.link || ('upi://pay?pa=' + encodeURIComponent(upi.vpa || 'merchant@upi') + '&am=' + (order.total / 100).toFixed(2) + '&tn=' + encodeURIComponent(order.id) + '&cu=INR');
      var qrBox = NL.$('#trackQrContainer');
      if (qrBox && window.generateQRSVG) {
        qrBox.innerHTML = window.generateQRSVG(link, 2);
      }
      var uAmt = NL.$('#trackUpiAmount');
      if (uAmt) uAmt.textContent = NL.inr(order.total);
      var uVpa = NL.$('#trackUpiVpa');
      if (uVpa) uVpa.textContent = upi.vpa || 'merchant@upi';
      var uInt = NL.$('#trackUpiIntentBtn');
      if (uInt) uInt.href = link;

      var utrBtn = NL.$('#trackUtrBtn');
      var utrInp = NL.$('#trackUtrInp');
      var utrMsg = NL.$('#trackUtrMsg');
      if (order.payment_status === 'utr_submitted' && order.utr) {
        if (utrMsg) utrMsg.innerHTML = '<span style="color:var(--ok)">&#10003; UTR ' + NL.esc(order.utr) + ' submitted (verification in progress)</span>';
        if (utrInp) { utrInp.value = order.utr; utrInp.disabled = true; }
        if (utrBtn) utrBtn.style.display = 'none';
      } else if (utrBtn && utrInp) {
        utrBtn.onclick = async function () {
          var utrVal = utrInp.value.replace(/\D/g, '').trim();
          if (utrVal.length !== 12) {
            if (utrMsg) utrMsg.innerHTML = '<span style="color:var(--bad)">Enter a valid 12-digit UTR</span>';
            return;
          }
          utrBtn.disabled = true;
          utrBtn.textContent = 'Submitting...';
          try {
            await NL.api('orders/' + encodeURIComponent(order.id) + '/utr', {
              method: 'POST',
              body: { phone: order.phone, utr: utrVal }
            });
            if (utrMsg) utrMsg.innerHTML = '<span style="color:var(--ok)">&#10003; UTR submitted. Our team is verifying the payment.</span>';
            utrInp.disabled = true;
            utrBtn.style.display = 'none';
            NL.toast('UTR submitted');
          } catch (e) {
            utrBtn.disabled = false;
            utrBtn.textContent = 'Submit UTR';
            if (utrMsg) utrMsg.innerHTML = '<span style="color:var(--bad)">' + NL.esc(e.message || 'Failed') + '</span>';
          }
        };
      }
    } else {
      if (upiCard) upiCard.style.display = 'none';
    }

    // Line items
    var itemsEl = NL.$('#orderItemsList');
    if (itemsEl && order.items) {
      itemsEl.innerHTML = order.items.map(function (it) {
        var imgHtml = it.image ? '<img src="' + NL.esc(it.image) + '" alt="' + NL.esc(it.name) + '" width="64" height="80" style="object-fit:cover;border:1px solid var(--rule)">' : '';
        return (
          '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;padding:12px 0;border-bottom:1px solid var(--rule);align-items:center">' +
            imgHtml +
            '<div>' +
              '<div style="font-weight:500;font-size:15px">' + NL.esc(it.name) + '</div>' +
              '<div class="muted" style="font-size:13px">' + NL.esc(it.colour) + ' &bull; Size ' + NL.esc(it.size) + ' &bull; Qty: ' + it.qty + '</div>' +
              '<div style="font-size:12px;color:var(--muted)">HSN: ' + (it.hsn || '620520') + ' &bull; GST ' + it.gst_rate + '% included</div>' +
            '</div>' +
            '<div style="font-weight:600">' + NL.inr(it.line_total) + '</div>' +
          '</div>'
        );
      }).join('');
    }

    // Shipping address
    var addrEl = NL.$('#orderShippingAddr');
    if (addrEl) {
      addrEl.innerHTML = '<b>' + NL.esc(order.customer_name) + '</b><br>' +
        NL.esc(order.address_line1) + '<br>' +
        (order.address_line2 ? NL.esc(order.address_line2) + '<br>' : '') +
        NL.esc(order.city) + ', ' + NL.esc(order.state) + ' - ' + NL.esc(order.pincode) + '<br>' +
        '<span class="muted">Phone:</span> +91 ' + NL.esc(order.phone) + '<br>' +
        '<span class="muted">Email:</span> ' + NL.esc(order.email);
    }

    // Financial breakdown
    var subEl = NL.$('#cSubtotal');
    if (subEl) subEl.textContent = NL.inr(order.subtotal);

    var discEl = NL.$('#cDiscount');
    var discLbl = NL.$('#cDiscountLabel');
    if (discEl && discLbl) {
      if (order.discount > 0) {
        discEl.style.display = 'block';
        discLbl.style.display = 'block';
        discEl.textContent = '-' + NL.inr(order.discount);
        discLbl.textContent = 'Discount' + (order.coupon_code ? ' (' + order.coupon_code + ')' : '');
      } else {
        discEl.style.display = 'none';
        discLbl.style.display = 'none';
      }
    }

    var shipEl = NL.$('#cShipping');
    if (shipEl) shipEl.textContent = order.shipping_fee > 0 ? NL.inr(order.shipping_fee) : 'Free';

    var codEl = NL.$('#cCodFee');
    var codLbl = NL.$('#cCodLabel');
    if (codEl && codLbl) {
      if (order.cod_fee > 0) {
        codEl.style.display = 'block';
        codLbl.style.display = 'block';
        codEl.textContent = NL.inr(order.cod_fee);
      } else {
        codEl.style.display = 'none';
        codLbl.style.display = 'none';
      }
    }

    var totEl = NL.$('#cTotal');
    if (totEl) totEl.textContent = NL.inr(order.total);

    // Timeline events
    var tEl = NL.$('#orderTimeline');
    if (tEl) {
      var evs = order.events || [];
      if (!evs.length) {
        tEl.innerHTML = '<li>Order placed successfully</li>';
      } else {
        tEl.innerHTML = evs.map(function (e) {
          var dt = new Date(e.ts);
          var tsFormatted = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          return (
            '<li>' +
              '<b>' + NL.esc(e.note || e.type.replace(/_/g, ' ')) + '</b>' +
              '<small>' + tsFormatted + (e.actor ? ' &bull; ' + NL.esc(e.actor) : '') + '</small>' +
            '</li>'
          );
        }).join('');
      }
    }

    // Invoice download link
    var inv = NL.$('#invoiceBtn');
    if (inv) {
      if (order.status === 'cancelled') {
        inv.style.display = 'none';
      } else {
        inv.style.display = 'inline-block';
        inv.href = '/api/orders/' + encodeURIComponent(order.id) + '/invoice?phone=' + encodeURIComponent(order.phone) + '&download=1';
      }
    }
  }
})();
