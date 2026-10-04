/* Cannon Collapse: how each material looks, sounds and comes apart. Looks and sound only: the physics numbers
   (density, friction, bounce, break rules) stay in game.js under MAT.

   A new material is one entry here plus its physics numbers there:
     paint(c, w, h)  draws the block face, centred on 0,0, light from the top-left. The dark outline is added for you.
                     Give it a pattern or a mark that does not rely on colour.
     hit             sound for an ordinary knock        rate: its base pitch
     hardAt          impact speed at which the block shows damage (a mark that stays, and bits flying off)
     hardSound       sound for a hit that hard (optional)
     mark            'crack' | 'star' | 'fracture' | null, drawn in markCol and kept on the block (3 at most)
     chips           what flies off: shape ('splinter' | 'chip' | 'shard'), colours, how many at most
     dust            puff tint on a hard hit: 'grey' | 'tan' | 'frost' | null
     breakSound      sound when the block is destroyed (glass breaking, TNT going off) */
(function () {
  'use strict';
  const CC = window.CC = window.CC || {};
  const INK = '#0a1020', OUT = 2, RAD = 2.5;
  CC.INK = INK;

  function box(c, w, h, inset, r) {
    const x = -w / 2 + inset, y = -h / 2 + inset, W = w - inset * 2, H = h - inset * 2; r = Math.max(0, Math.min(r, W / 2, H / 2));
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + W - r, y); c.quadraticCurveTo(x + W, y, x + W, y + r); c.lineTo(x + W, y + H - r);
    c.quadraticCurveTo(x + W, y + H, x + W - r, y + H); c.lineTo(x + r, y + H); c.quadraticCurveTo(x, y + H, x, y + H - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function grad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; }
  function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }
  // corner highlight along the top and left edges
  function shine(c, w, h, col) { c.strokeStyle = col; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-w / 2 + 3.2, h / 2 - 4.5); c.lineTo(-w / 2 + 3.2, -h / 2 + 3.2); c.lineTo(w / 2 - 4.5, -h / 2 + 3.2); c.stroke(); }

  const MATERIALS = {
    wood: {
      hit: 'wood', rate: 1, hardAt: 4.5, hardSound: 'woodcrack', mark: 'crack', markCol: 'rgba(58,28,6,0.9)', markW: 1.5,
      chips: { shape: 'splinter', cols: ['#e9b45c', '#b8702a', '#f4d08a'], n: 6 }, dust: null, breakSound: null,
      paint(c, w, h) {            // planks: board seams and grain along the long side, darker edge
        const flat = w >= h, L = flat ? w : h, T = flat ? h : w;
        c.fillStyle = flat ? grad(c, 0, -h / 2, 0, h / 2, [0, '#eab45a', 1, '#c07a2c']) : grad(c, -w / 2, 0, w / 2, 0, [0, '#eab45a', 1, '#c07a2c']);
        c.fill();
        c.save(); if (!flat) c.rotate(Math.PI / 2);     // now x runs along the grain
        const boards = T >= 26 ? 3 : (T >= 15 ? 2 : 1);
        c.lineCap = 'round'; c.strokeStyle = 'rgba(92,48,12,0.75)'; c.lineWidth = 1.4; c.beginPath();
        for (let k = 1; k < boards; k++) { const y = -T / 2 + T * k / boards; c.moveTo(-L / 2 + 3, y); c.lineTo(L / 2 - 3, y); }
        c.stroke();
        c.strokeStyle = 'rgba(92,48,12,0.38)'; c.lineWidth = 1; c.beginPath();
        for (let k = 0; k < boards; k++) {                // short grain ticks in each board
          const y = -T / 2 + T * (k + 0.5) / boards, n = Math.max(1, Math.round(L / 26));
          for (let j = 0; j < n; j++) { const x = -L / 2 + L * (j + 0.5 + ((k * 7 + j * 3) % 5 - 2) * 0.07) / n, len = Math.min(11, L * 0.3), up = (k + j) % 2 ? 0.7 : -0.7; c.moveTo(x - len / 2, y + up); c.lineTo(x + len / 2, y - up); }
        }
        c.stroke();
        if (L >= 60) { c.fillStyle = 'rgba(60,30,8,0.8)'; for (const sx of [-1, 1]) for (let k = 0; k < boards; k++) { c.beginPath(); c.arc(sx * (L / 2 - 6), -T / 2 + T * (k + 0.5) / boards, 1.1, 0, 6.2832); c.fill(); } }
        c.restore();
        box(c, w, h, 2.2, RAD); c.strokeStyle = 'rgba(128,72,22,0.9)'; c.lineWidth = 1.6; c.stroke();
        shine(c, w, h, 'rgba(255,232,170,0.8)');
      }
    },
    stone: {
      hit: 'stone', rate: 1, hardAt: 5, hardSound: null, mark: null, markCol: null, markW: 0,
      chips: { shape: 'chip', cols: ['#aab2be', '#6f7886', '#d2d8e0'], n: 5 }, dust: 'grey', breakSound: null,
      paint(c, w, h) {            // chiselled: light top and left faces, dark bottom and right, a few pits
        const b = Math.max(3, Math.min(5.5, Math.min(w, h) * 0.2)), x = w / 2, y = h / 2;
        c.fillStyle = '#8d96a4'; c.fill();
        poly(c, [-x, -y, x, -y, x - b, -y + b, -x + b, -y + b], '#c3cad4');
        poly(c, [-x, -y, -x + b, -y + b, -x + b, y - b, -x, y], '#a9b2bf');
        poly(c, [-x, y, -x + b, y - b, x - b, y - b, x, y], '#5a6370');
        poly(c, [x, -y, x, y, x - b, y - b, x - b, -y + b], '#6d7684');
        c.fillStyle = 'rgba(40,48,62,0.45)';
        const n = Math.max(2, Math.round(w * h / 420));
        for (let k = 0; k < n; k++) { const fx = ((k * 37 + 11) % 100) / 100 - 0.5, fy = ((k * 61 + 29) % 100) / 100 - 0.5; c.fillRect(fx * (w - b * 2 - 6) - 1, fy * (h - b * 2 - 6) - 1, 2.4, 2); }
      }
    },
    glass: {
      hit: 'clink', rate: 1, hardAt: 1.5, hardSound: null, mark: 'star', markCol: 'rgba(255,255,255,0.95)', markW: 1.1,
      chips: null, dust: null, breakSound: 'glass',
      shards: { cols: ['rgba(190,235,250,0.85)', 'rgba(235,250,255,0.9)', 'rgba(140,205,235,0.8)'], n: 11 },
      paint(c, w, h) {            // see-through pane: diagonal sheen, bright inner rim
        c.fillStyle = 'rgba(150,215,245,0.36)'; c.fill();
        const s = Math.min(w, h), d = Math.max(w, h) + 6;
        c.fillStyle = 'rgba(255,255,255,0.34)'; c.save(); c.translate(-w * 0.16, -h * 0.1); c.rotate(-Math.PI / 4); c.fillRect(-s * 0.16, -d, s * 0.2, d * 2); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(s * 0.12, -d, s * 0.08, d * 2); c.restore();
        box(c, w, h, 3, RAD); c.strokeStyle = 'rgba(232,250,255,0.85)'; c.lineWidth = 1.2; c.stroke();
      }
    },
    ice: {
      hit: 'ice', rate: 1, hardAt: 3.5, hardSound: null, mark: 'fracture', markCol: '#ffffff', markW: 1.7,
      chips: { shape: 'shard', cols: ['#ffffff', '#d5efff', '#a5dbfb'], n: 6 }, dust: 'frost', breakSound: null,
      paint(c, w, h) {            // solid block cut in facets, frosted top
        const x = w / 2, y = h / 2, px = -w * 0.16, py = -h * 0.12;
        c.fillStyle = grad(c, -x, -y, x, y, [0, '#f4fcff', 0.5, '#a9defa', 1, '#63b3ea']); c.fill();
        poly(c, [-x, -y, px, py, -x, y], 'rgba(255,255,255,0.3)');
        poly(c, [x, y, px, py, x, -y], 'rgba(30,110,190,0.16)');
        poly(c, [-x, -y, px, py, x, -y], 'rgba(255,255,255,0.14)');
        c.strokeStyle = 'rgba(40,120,190,0.3)'; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();     // facet edges stay soft, so real fracture lines stand out
        for (const q of [[-x + 2, -y + 2], [x - 2, -y + 2], [x - 2, y - 2], [-x + 2, y - 2]]) { c.moveTo(px, py); c.lineTo(q[0], q[1]); }
        c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-x, -y, w, 3.6);
      }
    },
    tnt: {
      hit: 'stone', rate: 1.35, hardAt: Infinity, hardSound: null, mark: null, markCol: null, markW: 0,
      chips: null, dust: null, breakSound: 'tnt',
      paint(c, w, h) {            // red barrel: round shading, two hoops, warning sign
        const x = w / 2, y = h / 2;
        c.fillStyle = grad(c, -x, 0, x, 0, [0, '#8c1c15', 0.28, '#e44b3a', 0.42, '#f47a64', 0.7, '#c73225', 1, '#77140f']); c.fill();
        c.fillStyle = 'rgba(40,10,12,0.72)'; c.fillRect(-x, -y + 3.2, w, 2.6); c.fillRect(-x, y - 5.8, w, 2.6);
        const s = Math.min(w, h) * 0.3;
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 1.1, s * 0.85); c.lineTo(-s * 1.1, s * 0.85); c.closePath();
        c.fillStyle = '#ffd23c'; c.fill(); c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
        c.fillStyle = INK; c.fillRect(-0.9, -s * 0.42, 1.8, s * 0.68); c.fillRect(-0.9, s * 0.42, 1.8, 1.8);
      }
    }
  };
  CC.MATERIALS = MATERIALS;

  // ---- block faces, drawn once per size to a small off-screen canvas ----
  const cache = new Map(), PAD = 2;
  CC.TEX_PAD = PAD;
  CC.tex = function (mat, w, h, ts) {
    const key = mat + '|' + w + '|' + h + '|' + ts; let cv = cache.get(key); if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = Math.ceil((w + PAD * 2) * ts); cv.height = Math.ceil((h + PAD * 2) * ts);
    const c = cv.getContext('2d'); c.scale(ts, ts); c.translate(w / 2 + PAD, h / 2 + PAD);
    c.save(); box(c, w, h, OUT / 2, RAD); c.clip(); box(c, w, h, OUT / 2, RAD); MATERIALS[mat].paint(c, w, h); c.restore();
    box(c, w, h, OUT / 2, RAD); c.strokeStyle = INK; c.lineWidth = OUT; c.lineJoin = 'round'; c.stroke();
    cache.set(key, cv); return cv;
  };
  CC.texClear = function () { cache.clear(); };

  // ---- damage marks: made once when the hit happens, kept on the block (not on its physics) ----
  // Each mark is a flat list of line segments x1,y1,x2,y2,... in the block's own coordinates.
  CC.addMark = function (p, lx, ly, rnd) {
    const T = MATERIALS[p.mat]; if (!T.mark) return false;
    if (!p.marks) p.marks = [];
    if (p.marks.length >= 3) return false;
    const mx = p.w / 2 - 2.5, my = p.h / 2 - 2.5, cl = (v, m) => Math.max(-m, Math.min(m, v)), seg = [];
    const x0 = cl(lx, mx - 1), y0 = cl(ly, my - 1);
    const ray = (x, y, a, len, steps, jit) => {
      for (let k = 0; k < steps; k++) { const a2 = a + (rnd() - 0.5) * jit, nx = cl(x + Math.cos(a2) * len / steps, mx), ny = cl(y + Math.sin(a2) * len / steps, my); seg.push(x, y, nx, ny); x = nx; y = ny; }
      return [x, y];
    };
    if (T.mark === 'crack') {             // a split running along the grain, with one short branch
      const along = p.w >= p.h ? 0 : Math.PI / 2, len = Math.min(Math.max(p.w, p.h) * 0.45, 12 + rnd() * 12);
      ray(x0, y0, along, len, 4, 0.9); const e = ray(x0, y0, along + Math.PI, len * 0.8, 3, 0.9);
      ray((x0 + e[0]) / 2, (y0 + e[1]) / 2, along + (rnd() < 0.5 ? 1 : -1) * 0.9, 5 + rnd() * 4, 2, 0.5);
    } else if (T.mark === 'star') {       // rays from the point of impact, joined by a broken ring
      const n = 6, a0 = rnd() * 6.283, mid = [];
      for (let k = 0; k < n; k++) { const a = a0 + k * 6.283 / n + (rnd() - 0.5) * 0.5, len = 7 + rnd() * 9; const m = ray(x0, y0, a, len * 0.5, 1, 0.3); mid.push(m); ray(m[0], m[1], a, len * 0.5, 1, 0.7); }
      for (let k = 0; k < n; k++) if (rnd() < 0.6) { const a = mid[k], b = mid[(k + 1) % n]; seg.push(a[0], a[1], b[0], b[1]); }
    } else {                              // ice: a few long fracture lines, each forking once
      const a0 = rnd() * 6.283;
      for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094 + (rnd() - 0.5) * 0.7, len = 10 + rnd() * 12; const m = ray(x0, y0, a, len * 0.55, 2, 0.5); ray(m[0], m[1], a + 0.5, len * 0.45, 1, 0.4); ray(m[0], m[1], a - 0.6, len * 0.35, 1, 0.4); }
    }
    p.marks.push(new Float32Array(seg)); return true;
  };
  CC.drawMarks = function (c, p) {
    const T = MATERIALS[p.mat], ms = p.marks; c.strokeStyle = T.markCol; c.lineWidth = T.markW; c.lineCap = 'round'; c.beginPath();
    for (let m = 0; m < ms.length; m++) { const s = ms[m]; for (let i = 0; i < s.length; i += 4) { c.moveTo(s[i], s[i + 1]); c.lineTo(s[i + 2], s[i + 3]); } }
    c.stroke();
  };
})();
