// Server-rendered GST invoice and packing slip (A4, print CSS).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (p) => 'Rs ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const taxIn = (gross, rate) => gross - Math.round((gross * 100) / (100 + rate));

const CSS = `
@page{size:A4;margin:14mm}
*{box-sizing:border-box}body{font:13px/1.45 'Inter',Arial,sans-serif;color:#1B1A17;margin:0;background:#fff}
.sheet{max-width:794px;margin:0 auto;padding:28px}
h1{font:600 22px/1.2 Georgia,serif;margin:0}.muted{color:#6b665c}.row{display:flex;justify-content:space-between;gap:24px}
.brand{font-weight:700;letter-spacing:.2em;font-size:15px}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #d9d2c4;padding:7px 6px;text-align:left;vertical-align:top}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#6b665c}.r{text-align:right}
.tot td{border:none;padding:3px 6px}.tot .g td{border-top:1px solid #1B1A17;font-weight:700;font-size:14px;padding-top:8px}
.box{border:1px solid #d9d2c4;padding:10px 12px;margin-top:14px}
.btn{position:fixed;right:16px;top:16px;background:#1B1A17;color:#fff;border:0;padding:10px 16px;font:600 13px Inter,Arial;cursor:pointer}
@media print{.btn{display:none}.sheet{padding:0}}
`;

function head(title, settings) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body data-layout-archetype="apparel-order-ops"><button class="btn" onclick="window.print()">Print / Save PDF</button><div class="sheet">`;
}

export function invoiceHTML(order, items, settings) {
  const intra = order.tax_mode === 'intra';
  let taxable = 0; let cgst = 0; let sgst = 0; let igst = 0;
  const rows = items.map((it, i) => {
    const base = it.line_total - it.tax;
    taxable += base;
    const half = Math.floor(it.tax / 2);
    if (intra) { cgst += half; sgst += it.tax - half; } else igst += it.tax;
    return `<tr><td>${i + 1}</td><td><strong>${esc(it.name)}</strong><br><span class="muted">${esc(it.colour)} / ${esc(it.size)} - ${esc(it.sku)}</span></td><td>${esc(it.hsn)}</td><td class="r">${it.qty}</td><td class="r">${inr(Math.round(base / it.qty))}</td><td class="r">${inr(base)}</td><td class="r">${it.gst_rate}%</td><td class="r">${intra ? inr(Math.floor(it.tax / 2)) + ' + ' + inr(it.tax - Math.floor(it.tax / 2)) : inr(it.tax)}</td><td class="r">${inr(it.line_total)}</td></tr>`;
  });
  const svcRate = Number(settings.gst_rate_services) || 18;
  const svc = [['Shipping', order.shipping_fee], ['Cash on delivery fee', order.cod_fee]].filter(([, a]) => a > 0);
  svc.forEach(([label, amt]) => {
    const t = taxIn(amt, svcRate); const base = amt - t; taxable += base;
    const half = Math.floor(t / 2);
    if (intra) { cgst += half; sgst += t - half; } else igst += t;
    rows.push(`<tr><td>${rows.length + 1}</td><td>${label}</td><td>9965</td><td class="r">1</td><td class="r">${inr(base)}</td><td class="r">${inr(base)}</td><td class="r">${svcRate}%</td><td class="r">${intra ? inr(half) + ' + ' + inr(t - half) : inr(t)}</td><td class="r">${inr(amt)}</td></tr>`);
  });
  return head(`Invoice ${order.id}`, settings) + `
<div class="row"><div><div class="brand">${esc(settings.brand_name)}</div><div class="muted">${esc(settings.store_address)}<br>GSTIN ${esc(settings.store_gstin)}</div></div>
<div class="r"><h1>Tax invoice</h1><div>Invoice no. INV/${esc(order.id)}<br>Date ${fmtDate(order.created_at)}<br>Order ${esc(order.id)}</div></div></div>
<div class="row"><div class="box" style="flex:1"><strong>Bill to / Ship to</strong><br>${esc(order.customer_name)}<br>${esc(order.address1)}${order.address2 ? ', ' + esc(order.address2) : ''}<br>${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}<br>Mobile ${esc(order.phone)}</div>
<div class="box" style="flex:1"><strong>Payment</strong><br>${order.payment_method === 'cod' ? 'Cash on delivery' : 'UPI'} - ${esc(order.payment_status.replace(/_/g, ' '))}${order.utr ? '<br>UTR ' + esc(order.utr) : ''}<br>Place of supply: ${esc(order.state)}<br>Supply type: ${intra ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}</div></div>
<table><thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">${intra ? 'CGST + SGST' : 'IGST'}</th><th class="r">Amount</th></tr></thead><tbody>${rows.join('')}</tbody></table>
<table class="tot" style="margin-left:auto;width:320px">
<tr><td>Items total</td><td class="r">${inr(order.subtotal)}</td></tr>
${order.discount ? `<tr><td>Discount (${esc(order.coupon_code)})</td><td class="r">- ${inr(order.discount)}</td></tr>` : ''}
<tr><td>Taxable value</td><td class="r">${inr(taxable)}</td></tr>
${intra ? `<tr><td>CGST</td><td class="r">${inr(cgst)}</td></tr><tr><td>SGST</td><td class="r">${inr(sgst)}</td></tr>` : `<tr><td>IGST</td><td class="r">${inr(igst)}</td></tr>`}
<tr class="g"><td>Total (incl. GST)</td><td class="r">${inr(order.total)}</td></tr></table>
<p class="muted" style="margin-top:28px">Prices are inclusive of GST. This is a computer generated invoice and does not require a signature. Returns accepted within 7 days of delivery.</p>
</div></body></html>`;
}

export function slipHTML(order, items, settings) {
  const rows = items.map((it) => `<tr><td style="width:28px">[ ]</td><td><strong>${esc(it.name)}</strong><br><span class="muted">${esc(it.colour)} / ${esc(it.size)}</span></td><td>${esc(it.sku)}</td><td class="r"><strong>${it.qty}</strong></td></tr>`).join('');
  return head(`Packing slip ${order.id}`, settings) + `
<div class="row"><div><div class="brand">${esc(settings.brand_name)}</div><div class="muted">Packing slip</div></div><div class="r"><h1>${esc(order.id)}</h1><div>${fmtDate(order.created_at)}</div></div></div>
<div class="box"><strong>Ship to</strong><br>${esc(order.customer_name)} - ${esc(order.phone)}<br>${esc(order.address1)}${order.address2 ? ', ' + esc(order.address2) : ''}<br>${esc(order.city)}, ${esc(order.state)} ${esc(order.pincode)}</div>
<div class="box"><strong>${order.payment_method === 'cod' ? 'COLLECT CASH: ' + inr(order.total) : 'PREPAID - do not collect cash'}</strong>${order.courier ? `<br>Courier ${esc(order.courier)} - AWB ${esc(order.awb)}` : ''}</div>
<table><thead><tr><th></th><th>Item</th><th>SKU</th><th class="r">Qty</th></tr></thead><tbody>${rows}</tbody></table>
${order.notes ? `<div class="box"><strong>Notes</strong><br>${esc(order.notes).replace(/\n/g, '<br>')}</div>` : ''}
</div></body></html>`;
}
