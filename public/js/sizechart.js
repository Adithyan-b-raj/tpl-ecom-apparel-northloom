(function () {
  var C = {
    tops: { cols: ['Size', 'Chest (cm)', 'Shoulder (cm)', 'Length (cm)'], rows: [['XS', 86, 42, 66], ['S', 92, 44, 68], ['M', 98, 46, 70], ['L', 104, 48, 72], ['XL', 110, 50, 74], ['XXL', 116, 52, 76]] },
    bottoms: { cols: ['Size', 'Waist (cm)', 'Hip (cm)', 'Inseam (cm)'], rows: [['XS', 72, 90, 76], ['S', 77, 96, 77], ['M', 82, 102, 78], ['L', 87, 108, 79], ['XL', 92, 114, 80], ['XXL', 97, 120, 81]] },
    dress: { cols: ['Size', 'Bust (cm)', 'Waist (cm)', 'Hip (cm)'], rows: [['XS', 82, 64, 90], ['S', 86, 68, 94], ['M', 90, 72, 98], ['L', 95, 77, 103], ['XL', 100, 82, 108], ['XXL', 106, 88, 114]] },
    onesize: { cols: ['Dimension', 'Size'], rows: [['Width', '38 cm'], ['Height', '40 cm'], ['Depth', '12 cm'], ['Handle drop', '26 cm']] },
  };
  window.NL_SIZES = C;
  window.NL_chartHTML = function (g) {
    var t = C[g] || C.tops;
    return '<div class="chart-wrap"><table class="chart"><thead><tr>' + t.cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + t.rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return i === 0 ? '<th scope="row" style="color:inherit;font-size:13px;letter-spacing:0;text-transform:none;font-weight:600">' + c + '</th>' : '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  };
})();
