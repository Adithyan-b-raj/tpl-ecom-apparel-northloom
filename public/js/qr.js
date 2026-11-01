/**
 * Standalone QR Code SVG generator for NORTHLOOM (Zero external dependencies).
 * Generates valid QR Codes up to Version 10 in Byte mode (ISO/IEC 18004 compliant).
 */
(function () {
  'use strict';

  // Galois Field GF(256) tables
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; EXP[i + 255] = x;
      LOG[x] = i;
      x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    }
  })();

  function gfMul(x, y) {
    return x === 0 || y === 0 ? 0 : EXP[LOG[x] + LOG[y]];
  }

  function polyMul(p1, p2) {
    var r = new Uint8Array(p1.length + p2.length - 1);
    for (var i = 0; i < p1.length; i++) {
      for (var j = 0; j < p2.length; j++) {
        r[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return r;
  }

  function polyDiv(dividend, divisor) {
    var out = new Uint8Array(dividend);
    for (var i = 0; i < dividend.length - divisor.length + 1; i++) {
      var coef = out[i];
      if (coef !== 0) {
        for (var j = 1; j < divisor.length; j++) {
          out[i + j] ^= gfMul(divisor[j], coef);
        }
      }
    }
    return out.subarray(dividend.length - divisor.length + 1);
  }

  function rsGenPoly(numEcc) {
    var g = new Uint8Array([1]);
    for (var i = 0; i < numEcc; i++) {
      g = polyMul(g, new Uint8Array([1, EXP[i]]));
    }
    return g;
  }

  // Version table: [version, totalBytes, dataBytesL, ecBytesL, numBlocksL]
  // Levels: L (low, ~7% recovery) which maximises payload for UPI links
  var VERSIONS = [
    [1, 26, 19, 7, 1],
    [2, 44, 34, 10, 1],
    [3, 70, 55, 15, 1],
    [4, 100, 80, 20, 1],
    [5, 134, 108, 26, 1],
    [6, 172, 136, 18, 2],
    [7, 196, 156, 20, 2],
    [8, 242, 194, 24, 2],
    [9, 292, 232, 30, 2],
    [10, 346, 274, 18, 2 + 2], // 2 blocks of 68 + 2 blocks of 69
  ];

  // Alignment pattern centers for Versions 2-10
  var ALIGNMENT = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ];

  function getVersion(dataLen) {
    // 4 bits mode + 8 or 16 bits count + data
    for (var i = 0; i < VERSIONS.length; i++) {
      var v = VERSIONS[i];
      var countBits = v[0] < 10 ? 8 : 16;
      var availBits = v[2] * 8;
      if (4 + countBits + dataLen * 8 <= availBits) return v;
    }
    return null;
  }

  function encodeData(text, vInfo) {
    var raw = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) raw.push(c);
      else {
        var enc = encodeURIComponent(text.charAt(i));
        for (var j = 0; j < enc.length; j++) {
          if (enc[j] === '%') {
            raw.push(parseInt(enc.substr(j + 1, 2), 16));
            j += 2;
          } else raw.push(enc.charCodeAt(j));
        }
      }
    }

    var ver = vInfo[0];
    var dataCap = vInfo[2];
    var countBits = ver < 10 ? 8 : 16;
    var bits = [];

    function pushBits(val, len) {
      for (var b = len - 1; b >= 0; b--) {
        bits.push((val >> b) & 1);
      }
    }

    // Mode indicator: 0100 (Byte mode)
    pushBits(4, 4);
    // Character count
    pushBits(raw.length, countBits);
    // Data bytes
    for (var k = 0; k < raw.length; k++) {
      pushBits(raw[k], 8);
    }
    // Terminator
    var capBits = dataCap * 8;
    var pad = Math.min(4, capBits - bits.length);
    pushBits(0, pad);
    // Byte align
    while (bits.length % 8 !== 0) bits.push(0);

    // Convert to bytes
    var bytes = [];
    for (var m = 0; m < bits.length; m += 8) {
      var byteVal = 0;
      for (var b = 0; b < 8; b++) byteVal = (byteVal << 1) | bits[m + b];
      bytes.push(byteVal);
    }

    // Pad bytes
    var padByte = 0xec;
    while (bytes.length < dataCap) {
      bytes.push(padByte);
      padByte = padByte === 0xec ? 0x11 : 0xec;
    }

    return bytes;
  }

  function makeEcc(dataBytes, vInfo) {
    var ver = vInfo[0];
    var totalBytes = vInfo[1];
    var dataBytesCount = vInfo[2];
    var ecBytesPerBlock = vInfo[3];
    var numBlocks = ver === 10 ? 4 : vInfo[4];

    var blockLen = Math.floor(dataBytesCount / numBlocks);
    var remainder = dataBytesCount % numBlocks;

    var gen = rsGenPoly(ecBytesPerBlock);
    var blocks = [];
    var ecBlocks = [];

    var offset = 0;
    for (var b = 0; b < numBlocks; b++) {
      var len = blockLen + (b >= numBlocks - remainder ? 1 : 0);
      var blk = dataBytes.slice(offset, offset + len);
      offset += len;
      blocks.push(blk);

      var dividend = new Uint8Array(len + ecBytesPerBlock);
      dividend.set(blk);
      var ecc = polyDiv(dividend, gen);
      ecBlocks.push(Array.from(ecc));
    }

    // Interleave
    var finalData = [];
    var maxDataLen = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
    for (var d = 0; d < maxDataLen; d++) {
      for (var b1 = 0; b1 < numBlocks; b1++) {
        if (d < blocks[b1].length) finalData.push(blocks[b1][d]);
      }
    }
    for (var e = 0; e < ecBytesPerBlock; e++) {
      for (var b2 = 0; b2 < numBlocks; b2++) {
        if (e < ecBlocks[b2].length) finalData.push(ecBlocks[b2][e]);
      }
    }

    return finalData;
  }

  function createMatrix(version) {
    var size = version * 4 + 17;
    var mat = [];
    var isReserved = [];
    for (var r = 0; r < size; r++) {
      mat[r] = new Int8Array(size);
      isReserved[r] = new Uint8Array(size);
    }

    function setModule(row, col, val) {
      mat[row][col] = val ? 1 : 0;
      isReserved[row][col] = 1;
    }

    // 1. Finder patterns (7x7 with 1px border)
    function drawFinder(row, col) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var r = row + dr;
          var c = col + dc;
          if (r >= 0 && r < size && c >= 0 && c < size) {
            var inFinder = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6);
            var isBlack = inFinder && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
            setModule(r, c, isBlack);
          }
        }
      }
    }
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // 2. Timing patterns
    for (var t = 8; t < size - 8; t++) {
      var isT = t % 2 === 0;
      if (!isReserved[6][t]) setModule(6, t, isT);
      if (!isReserved[t][6]) setModule(t, 6, isT);
    }

    // 3. Dark module
    setModule(size - 8, 8, true);

    // 4. Alignment patterns
    if (version >= 2) {
      var coords = ALIGNMENT[version - 1];
      for (var i = 0; i < coords.length; i++) {
        for (var j = 0; j < coords.length; j++) {
          var ar = coords[i];
          var ac = coords[j];
          if (isReserved[ar][ac]) continue;
          for (var dr1 = -2; dr1 <= 2; dr1++) {
            for (var dc1 = -2; dc1 <= 2; dc1++) {
              var on = (Math.abs(dr1) === 2 || Math.abs(dc1) === 2 || (dr1 === 0 && dc1 === 0));
              setModule(ar + dr1, ac + dc1, on);
            }
          }
        }
      }
    }

    // 5. Reserve format info
    for (var f1 = 0; f1 < 9; f1++) {
      if (!isReserved[8][f1]) isReserved[8][f1] = 1;
      if (!isReserved[f1][8]) isReserved[f1][8] = 1;
    }
    for (var f2 = size - 8; f2 < size; f2++) {
      if (!isReserved[8][f2]) isReserved[8][f2] = 1;
      if (!isReserved[f2][8]) isReserved[f2][8] = 1;
    }

    return { size: size, mat: mat, isReserved: isReserved };
  }

  function applyFormat(mat, size) {
    // Format bits for Error Correction Level L and Mask 0: 0b111011111000100
    var fmt = 0x77c4; // 15 bits
    for (var i = 0; i < 15; i++) {
      var bit = (fmt >> (14 - i)) & 1;
      // Along top-left
      var r1, c1;
      if (i < 6) { r1 = 8; c1 = i; }
      else if (i === 6) { r1 = 8; c1 = 7; }
      else if (i === 7) { r1 = 8; c1 = 8; }
      else if (i === 8) { r1 = 7; c1 = 8; }
      else { r1 = 14 - i; c1 = 8; }
      mat[r1][c1] = bit;

      // Along edges
      var r2, c2;
      if (i < 8) { r2 = size - 1 - i; c2 = 8; }
      else { r2 = 8; c2 = size - 15 + i; }
      mat[r2][c2] = bit;
    }
  }

  function placeBits(matObj, dataBytes) {
    var size = matObj.size;
    var mat = matObj.mat;
    var isReserved = matObj.isReserved;

    var bitIdx = 0;
    var totalBits = dataBytes.length * 8;

    var right = size - 1;
    var upward = true;

    while (right > 0) {
      if (right === 6) right--; // Skip vertical timing pattern
      for (var vert = 0; vert < size; vert++) {
        var r = upward ? size - 1 - vert : vert;
        for (var c = 0; c < 2; c++) {
          var col = right - c;
          if (isReserved[r][col]) continue;

          var bit = 0;
          if (bitIdx < totalBits) {
            var bByte = dataBytes[bitIdx >> 3];
            var bOffset = 7 - (bitIdx & 7);
            bit = (bByte >> bOffset) & 1;
            bitIdx++;
          }

          // Apply Mask 0: (row + col) % 2 === 0
          if ((r + col) % 2 === 0) bit ^= 1;
          mat[r][col] = bit;
        }
      }
      upward = !upward;
      right -= 2;
    }

    applyFormat(mat, size);
    return mat;
  }

  function generateQRMatrix(text) {
    var vInfo = getVersion(text.length);
    if (!vInfo) throw new Error('Data too long for QR generator');
    var data = encodeData(text, vInfo);
    var withEcc = makeEcc(data, vInfo);
    var matrixObj = createMatrix(vInfo[0]);
    return placeBits(matrixObj, withEcc);
  }

  window.generateQRSVG = function (text, margin) {
    margin = margin === undefined ? 3 : margin;
    try {
      var matrix = generateQRMatrix(text);
      var size = matrix.length;
      var total = size + margin * 2;
      var paths = [];

      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (matrix[r][c] === 1) {
            paths.push('M' + (c + margin) + ' ' + (r + margin) + 'h1v1h-1z');
          }
        }
      }

      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
        total + ' ' + total +
        '" shape-rendering="crispEdges" width="100%" height="100%" aria-label="QR Code">' +
        '<rect width="100%" height="100%" fill="#ffffff"/>' +
        '<path d="' + paths.join('') + '" fill="#1B1A17"/>' +
        '</svg>'
      );
    } catch (e) {
      console.error('QR Gen Error:', e);
      return '<div style="padding:20px;text-align:center;font-size:12px;color:#7a756c">Could not render QR code directly. Please use the UPI Pay link.</div>';
    }
  };
})();
