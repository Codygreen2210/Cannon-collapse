/* Cannon Collapse drawing: backdrop, platform, blocks, cannon, ball and trail, aim guide, text on the field.
   game.js hands over one object G each frame (the level state and the view); nothing here changes the game. */
(function () {
  'use strict';
  const CC = window.CC = window.CC || {}, FX = CC.fx, INK = CC.INK, PAD = CC.TEX_PAD, TAU = 6.2832;
  let ctx = null, ts = 2;
  const DASH = [5, 5], NODASH = [];

  // ---- ball: shaded iron, drawn once per type ----
  const ballPic = {};
  function ballSprite(type, r) {
    const key = type + ts; if (ballPic[key]) return ballPic[key];
    const R = r + 3, cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(R * 2 * ts);
    const c = cv.getContext('2d'); c.scale(ts, ts); c.translate(R, R);
    const heavy = type === 'h', g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    if (heavy) { g.addColorStop(0, '#7f899c'); g.addColorStop(0.45, '#333a4b'); g.addColorStop(1, '#0c1019'); }
    else { g.addColorStop(0, '#d3dae8'); g.addColorStop(0.5, '#77839b'); g.addColorStop(1, '#333c50'); }
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(0, 0, r + 1.6, 0, TAU); c.lineWidth = 1; c.strokeStyle = heavy ? 'rgba(200,214,240,0.75)' : 'rgba(200,214,240,0.4)'; c.stroke();
    c.beginPath(); c.ellipse(-r * 0.36, -r * 0.42, r * (heavy ? 0.34 : 0.2), r * (heavy ? 0.22 : 0.13), -0.7, 0, TAU); c.fillStyle = 'rgba(255,255,255,' + (heavy ? 0.8 : 0.9) + ')'; c.fill();
    return (ballPic[key] = cv);
  }
  function drawBall(b, K) {
    const p = b.plugin, r = K.BALL[p.type].r, R = r + 3, pic = ballSprite(p.type, r), tr = p.trail, n = p.tn;
    if (n > 1) {                  // tapering trail: fading segments, oldest first
      const sp = Math.min(1, Math.hypot(b.velocity.x, b.velocity.y) / 3);
      ctx.fillStyle = p.type === 'h' ? '#aab6cc' : '#dfe8f6';
      const i0 = (p.th - n + p.tcap) % p.tcap, wide = r * (p.type === 'h' ? 0.95 : 0.8); let x0 = tr[i0 * 2], y0 = tr[i0 * 2 + 1], w0 = 0;
      for (let k = 1; k <= n; k++) {       // one four-sided piece per step, each wider and brighter than the last
        let x1, y1; if (k === n) { x1 = b.position.x; y1 = b.position.y; } else { const i = (i0 + k) % p.tcap; x1 = tr[i * 2]; y1 = tr[i * 2 + 1]; }
        const f = k / n, w1 = wide * f, dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
        if (d > 0.01) { const nx = -dy / d, ny = dx / d; ctx.globalAlpha = (0.02 + 0.26 * f * f) * sp;
          ctx.beginPath(); ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.lineTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.lineTo(x0 - nx * w0, y0 - ny * w0); ctx.fill(); }
        x0 = x1; y0 = y1; w0 = w1;
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(pic, b.position.x - R, b.position.y - R, R * 2, R * 2);
  }

  function drawBlock(b) {
    const p = b.plugin, w = p.w, h = p.h;
    if (p.texS !== ts) { p.tex = CC.tex(p.mat, w, h, ts); p.texS = ts; }
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    ctx.globalAlpha = p.cleared ? 0.38 : 1;
    ctx.drawImage(p.tex, -w / 2 - PAD, -h / 2 - PAD, w + PAD * 2, h + PAD * 2);
    if (p.marks) CC.drawMarks(ctx, p);
    if (p.prop === 'pin') { ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fillStyle = '#2b3448'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#dfe6f2'; ctx.stroke(); }
    if (p.flash > 0.02) { ctx.globalAlpha = p.flash * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2); }
    ctx.restore();
  }

  // dotted aim arc (unchanged on purpose: it is the part of the alpha that worked)
  function arc(K, angle, power, type, style, maxLen) {
    const a = angle * Math.PI / 180, v = (K.VMIN + (K.VMAX - K.VMIN) * power) * K.BALL[type].speed, C = K.CANNON;
    const x0 = C.x + Math.cos(a) * C.len, y0 = C.y - Math.sin(a) * C.len, vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
    ctx.fillStyle = style; let len = 0, lx = x0, ly = y0, next = 10;
    for (let t = 0.25; t < 60 && len < maxLen; t += 0.25) {
      const x = x0 + vx * t, y = y0 + vy * t + 0.5 * K.G60 * t * t; len += Math.hypot(x - lx, y - ly); lx = x; ly = y;
      if (len >= next) { next += 10; const f = 1 - len / maxLen; ctx.globalAlpha = 0.25 + 0.75 * f; ctx.beginPath(); ctx.arc(x, y, 1.6 + 1.6 * f, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  function slab(x, y, w, h, fill, top, shade) {     // stone piece: flat fill, light top edge, shaded right side, dark outline
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    if (shade) { ctx.fillStyle = shade; ctx.fillRect(x + w * 0.7, y, w * 0.3, h); }
    if (top) { ctx.fillStyle = top; ctx.fillRect(x, y, w, 2.5); }
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(x, y, w, h);
  }

  // ---- cannon: iron barrel on a wooden carriage, pivot near the back of the barrel ----
  let ironGrad = null, woodGrad = null;
  function drawCannon(G, ar, pull) {
    const C = G.K.CANNON, GROUND = G.K.GROUND, kick = FX.kick(), back = kick + pull;
    if (!ironGrad) {
      ironGrad = ctx.createLinearGradient(0, -10, 0, 10); ironGrad.addColorStop(0, '#77849e'); ironGrad.addColorStop(0.4, '#454f68'); ironGrad.addColorStop(1, '#1b2132');
      woodGrad = ctx.createLinearGradient(0, C.y, 0, C.y + 22); woodGrad.addColorStop(0, '#d79a45'); woodGrad.addColorStop(1, '#a8651f');
    }
    // stand
    slab(C.x - 21, C.y + 26, 40, GROUND - C.y - 26, '#3a4862', null, '#2e3a52');
    slab(C.x - 29, C.y + 21, 54, 7, '#aeb6c4', '#e3e8ef', null);
    const cx = C.x - kick * 0.25;           // the carriage rolls back a touch with the kick
    // carriage cheek
    ctx.beginPath(); ctx.moveTo(cx - 27, C.y + 21); ctx.lineTo(cx + 21, C.y + 21); ctx.lineTo(cx + 15, C.y + 5); ctx.lineTo(cx - 4, C.y - 3); ctx.lineTo(cx - 14, C.y + 6); ctx.lineTo(cx - 27, C.y + 14); ctx.closePath();
    ctx.fillStyle = woodGrad; ctx.fill(); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
    // barrel
    ctx.save(); ctx.translate(C.x, C.y); ctx.rotate(-ar); ctx.translate(-back, 0);
    const fl = FX.flash();
    if (fl > 0) {                           // muzzle flash: 3 frames, bigger for a harder shot
      const s = (0.75 + 0.6 * FX.flashPow()) * (fl === 3 ? 1 : (fl === 2 ? 0.72 : 0.42)), mx = C.len + 1;
      ctx.globalAlpha = 0.55; ctx.drawImage(FX.PUFFS.warm, mx - 6 * s, -20 * s, 40 * s, 40 * s); ctx.globalAlpha = 1;
      for (let k = 0; k < 3; k++) {
        const q = s * (k === 0 ? 1 : (k === 1 ? 0.62 : 0.3)); ctx.fillStyle = k === 0 ? '#ff9a2b' : (k === 1 ? '#ffe070' : '#ffffff');
        ctx.beginPath(); ctx.moveTo(mx, -5 * q); ctx.lineTo(mx + 9 * q, -11 * q); ctx.lineTo(mx + 9 * q, -3.5 * q); ctx.lineTo(mx + 25 * q, 0); ctx.lineTo(mx + 9 * q, 3.5 * q); ctx.lineTo(mx + 9 * q, 11 * q); ctx.lineTo(mx, 5 * q); ctx.closePath(); ctx.fill();
      }
    }
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(-19.5, 0, 3.6, 0, TAU); ctx.fillStyle = '#39435a'; ctx.fill(); ctx.stroke();                        // knob at the back
    ctx.beginPath(); ctx.moveTo(-13, -10.5); ctx.lineTo(C.len - 4, -8); ctx.lineTo(C.len - 4, 8); ctx.lineTo(-13, 10.5); ctx.quadraticCurveTo(-19, 0, -13, -10.5); ctx.closePath();
    ctx.fillStyle = ironGrad; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9aa7c0'; ctx.fillRect(5, -9.6, 5, 19.2); ctx.strokeRect(5, -9.6, 5, 19.2);                                   // lighter band
    ctx.fillStyle = ironGrad; ctx.fillRect(C.len - 6, -10, 6, 20); ctx.strokeRect(C.len - 6, -10, 6, 20);                         // muzzle ring
    ctx.strokeStyle = 'rgba(214,224,242,0.55)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, -7.4); ctx.lineTo(3, -6.8); ctx.moveTo(12, -6.2); ctx.lineTo(C.len - 8, -5.2); ctx.stroke();
    ctx.restore();
    // wheel in front
    const wx = cx - 2, wy = C.y + 10, wr = 11;
    ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.fillStyle = '#c98a3a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#2b3448'; ctx.stroke();
    ctx.beginPath(); ctx.arc(wx, wy, wr + 1.5, 0, TAU); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = '#7a4718'; ctx.lineWidth = 1.8; ctx.beginPath();
    const wa = -kick * 0.03;
    for (let k = 0; k < 4; k++) { const a = wa + k * Math.PI / 4, c = Math.cos(a) * (wr - 2), s = Math.sin(a) * (wr - 2); ctx.moveTo(wx - c, wy - s); ctx.lineTo(wx + c, wy + s); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(wx, wy, 3.4, 0, TAU); ctx.fillStyle = '#56627c'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
  }

  // ---- backdrop: dark navy night, far ridges, a few stars. Fixed to the screen (no shake). ----
  const STARS = [22, 0.06, 71, 0.19, 118, 0.04, 163, 0.14, 214, 0.08, 262, 0.22, 305, 0.05, 338, 0.16, 46, 0.3, 139, 0.33, 236, 0.37, 322, 0.31, 92, 0.44, 189, 0.48, 286, 0.5];
  let sky = null, skyKey = -1;
  function backdrop(G) {
    const K = G.K, W = K.W, GROUND = K.GROUND, top = -G.oy;
    if (skyKey !== G.oy) { sky = ctx.createLinearGradient(0, top, 0, GROUND); sky.addColorStop(0, '#0a1126'); sky.addColorStop(0.6, '#13224a'); sky.addColorStop(1, '#22407a'); skyKey = G.oy; }
    ctx.fillStyle = sky; ctx.fillRect(0, top, W + 30, GROUND - top);
    const span = GROUND - top - G.hudB; ctx.fillStyle = '#dfe9ff';
    for (let i = 0; i < STARS.length; i += 2) { ctx.globalAlpha = 0.25 + (i % 6) * 0.07; ctx.fillRect(STARS[i], top + G.hudB + span * STARS[i + 1], 1.6, 1.6); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a3060'; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(0, GROUND - 58); ctx.lineTo(52, GROUND - 104); ctx.lineTo(96, GROUND - 66); ctx.lineTo(150, GROUND - 122); ctx.lineTo(214, GROUND - 60); ctx.lineTo(268, GROUND - 96); ctx.lineTo(330, GROUND - 52); ctx.lineTo(W + 30, GROUND - 80); ctx.lineTo(W + 30, GROUND); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#122449'; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(0, GROUND - 30); ctx.lineTo(40, GROUND - 46); ctx.lineTo(120, GROUND - 40); ctx.lineTo(170, GROUND - 18); ctx.lineTo(230, GROUND - 58); ctx.lineTo(300, GROUND - 50); ctx.lineTo(W + 30, GROUND - 20); ctx.lineTo(W + 30, GROUND); ctx.closePath(); ctx.fill();
  }

  CC.draw = function (G) {
    ctx = G.ctx; const K = G.K, S = G.S, aim = G.aim, W = K.W, GROUND = K.GROUND, C = K.CANNON, z = G.dpr * G.scale;
    const nts = Math.max(2, Math.min(3, Math.ceil(z))); if (nts !== ts) { ts = nts; }
    const aiming = !!(aim && aim.live);
    const sx = aiming ? 0 : FX.shakeX(), sy = aiming ? 0 : FX.shakeY();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#0a1126'; ctx.fillRect(0, 0, G.canvas.width, G.canvas.height);
    ctx.setTransform(z, 0, 0, z, -K.XL * z, G.oy * z);
    backdrop(G);
    // ---- the world (this part shakes) ----
    ctx.setTransform(z, 0, 0, z, (sx - K.XL) * z, (G.oy + sy) * z);
    ctx.fillStyle = '#14233f'; ctx.fillRect(-20, GROUND, W + 60, G.VH); ctx.fillStyle = '#3f5f96'; ctx.fillRect(-20, GROUND, W + 60, 3); ctx.fillStyle = INK; ctx.fillRect(-20, GROUND + 3, W + 60, 1.5);
    // platform (ice sections are pale blue with a white top)
    const P = S.plat; slab(P.x - P.pw / 2, S.top + 13, P.pw, GROUND - S.top - 13, '#3a4862', null, '#2e3a52');
    for (const g of P.segs) { ctx.fillStyle = g[2] ? '#a9dcf8' : '#c5cbd6'; ctx.fillRect(g[0], S.top, g[1] - g[0], 14); ctx.fillStyle = g[2] ? '#ffffff' : '#eef1f6'; ctx.fillRect(g[0], S.top, g[1] - g[0], g[2] ? 3.5 : 2.5); }
    ctx.fillStyle = 'rgba(20,30,52,0.35)'; ctx.fillRect(P.x - P.w / 2, S.top + 10, P.w, 4);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(P.x - P.w / 2, S.top, P.w, 14);
    // last shot marker (so a retry can be a correction, not a guess), then the aim arc
    const curType = S.ammo[Math.min(S.sel, S.ammo.length - 1)] || 'n', ls = G.lastShot;
    if (ls && ls.level === S.level && S.phase === 'aim' && S.used === 0) arc(K, ls.angle, ls.power, ls.type, '#6f7c8c', 70);
    if (aiming) arc(K, aim.angle, aim.power, curType, '#ffd257', K.ARC_LEN);
    // pivots, ropes, blocks, balls
    for (const q of S.posts) { ctx.fillStyle = '#3a4862'; ctx.beginPath(); ctx.moveTo(q.x - 11, S.top); ctx.lineTo(q.x + 11, S.top); ctx.lineTo(q.x + 3, q.y); ctx.lineTo(q.x - 3, q.y); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
    for (const b of S.props) {
      const p = b.plugin; if (p.prop !== 'rope' || p.gone) continue;
      const c = Math.cos(b.angle), s = Math.sin(b.angle), tx = b.position.x + s * p.h / 2, ty = b.position.y - c * p.h / 2;
      ctx.strokeStyle = 'rgba(201,196,182,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.ax, -G.oy + G.hudB + 4); ctx.stroke();
      ctx.strokeStyle = '#d8c79c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.ax, p.ay, 5, 0, TAU); ctx.fillStyle = '#aeb6c4'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    }
    for (const b of S.props) if (!b.plugin.gone) drawBlock(b);
    for (const b of S.blocks) if (!b.plugin.gone) drawBlock(b);
    for (const b of S.balls) drawBall(b, K);
    const ang = aiming ? aim.angle : (ls && ls.level === S.level ? ls.angle : 30);
    drawCannon(G, ang * Math.PI / 180, aiming ? aim.power * 6 : 0);
    FX.draw(ctx);
    // ---- on top, never shaken: aim guide and text ----
    ctx.setTransform(z, 0, 0, z, -K.XL * z, G.oy * z);
    if (aiming) {   // power bar by the cannon + the pull itself under the thumb
      ctx.fillStyle = 'rgba(242,239,230,0.25)'; ctx.fillRect(C.x - 22, C.y + 34, 44, 6); ctx.fillStyle = '#ffd257'; ctx.fillRect(C.x - 22, C.y + 34, 44 * aim.power, 6);
      ctx.strokeStyle = 'rgba(242,239,230,0.55)'; ctx.lineWidth = 2; ctx.setLineDash(DASH); ctx.beginPath(); ctx.moveTo(aim.sx, aim.sy); ctx.lineTo(aim.x, aim.y); ctx.stroke(); ctx.setLineDash(NODASH);
      ctx.beginPath(); ctx.arc(aim.sx, aim.sy, 5, 0, TAU); ctx.fillStyle = 'rgba(242,239,230,0.6)'; ctx.fill();
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 13 + aim.power * 6, 0, TAU); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (S.L.tip && S.used === 0 && !aiming && S.phase === 'aim') { ctx.fillStyle = '#f2efe6'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillText(S.L.tip, K.XL + K.VW / 2, -G.oy + G.hudB + 30); }
    if (S.phase === 'aim' && S.remaining > 0 && S.used > 0) {
      ctx.fillStyle = S.remaining <= 2 ? '#ffd257' : 'rgba(242,239,230,0.7)'; ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(S.remaining + (S.remaining === 1 ? ' block left' : ' blocks left'), Math.min(S.plat.x, W - 62), GROUND + 24);
    }
  };
})();
