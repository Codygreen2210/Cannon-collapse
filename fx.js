/* Cannon Collapse effects: particles, screen shake, slow motion, cannon kick. Drawn only: nothing here touches a physics body,
   and game.js never calls into it during the headless test runs.
   Particles live in a pool of fixed size (CAP). When it is full the oldest is dropped. Nothing is allocated per frame. */
(function () {
  'use strict';
  const CC = window.CC = window.CC || {};
  const CAP = 160, PER_FRAME = 48;
  const PUFF = 0, SPARK = 1, SHARD = 2, SPLINTER = 3, CHIP = 4, RING = 5;
  const pool = new Array(CAP);
  for (let i = 0; i < CAP; i++) pool[i] = { on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 1, life: 0, max: 1, r: 1, grow: 0, rot: 0, vr: 0, col: '', a: 1, n: 0 };
  const junk = Object.assign({}, pool[0]);       // handed back when the frame's budget is spent, so callers need no checks
  let alive = 0, peak = 0, cursor = 0, budget = PER_FRAME, serial = 0, floor = 1e9;

  // own random numbers (repeatable, and no garbage)
  let seed = 2463534242;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }

  // ---- reduced motion: no shake, no slow motion ----
  let reduced = false;
  try { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); reduced = mq.matches; mq.addEventListener('change', e => { reduced = e.matches; }); } catch (e) { /* old browser: leave motion on */ }

  // ---- soft puff pictures (dust, smoke, glow), made once ----
  const TINT = { grey: [196, 202, 214], tan: [214, 198, 166], frost: [236, 247, 255], warm: [255, 176, 64], dark: [92, 96, 108] }, PUFFS = {};
  for (const k in TINT) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 48; const c = cv.getContext('2d'), t = TINT[k].join(','), g = c.createRadialGradient(24, 24, 2, 24, 24, 24);
    g.addColorStop(0, 'rgba(' + t + ',0.95)'); g.addColorStop(0.55, 'rgba(' + t + ',0.5)'); g.addColorStop(1, 'rgba(' + t + ',0)');
    c.fillStyle = g; c.fillRect(0, 0, 48, 48); PUFFS[k] = cv;
  }

  function spawn(kind, x, y, vx, vy, life, r, col) {
    if (budget <= 0) return junk;
    budget--;
    let p = null;
    for (let k = 0; k < CAP; k++) { const q = pool[(cursor + k) % CAP]; if (!q.on) { p = q; break; } }
    if (!p) { let old = Infinity; for (let k = 0; k < CAP; k++) if (pool[k].n < old) { old = pool[k].n; p = pool[k]; } alive--; }   // full: drop the oldest
    cursor = (cursor + 1) % CAP; alive++; if (alive > peak) peak = alive;
    p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.r = r; p.col = col;
    p.g = 0; p.drag = 0.985; p.grow = 0; p.rot = rnd() * 6.283; p.vr = 0; p.a = 1; p.n = serial++;
    return p;
  }

  // ---- emitters ----
  function dust(x, y, n, tint, size) {
    for (let i = 0; i < n; i++) { const p = spawn(PUFF, x + (rnd() - 0.5) * 6 * size, y - rnd() * 2, (rnd() - 0.5) * 2.4 * size, -0.15 - rnd() * 0.7, 22 + rnd() * 20, (3 + rnd() * 3.5) * size, tint); p.grow = 0.16 * size; p.drag = 0.93; p.g = -0.006; p.a = 0.75; }
  }
  function smoke(x, y, dx, dy, n, size) {
    for (let i = 0; i < n; i++) { const s = 0.6 + rnd() * 1.8, p = spawn(PUFF, x + dx * i * 2, y + dy * i * 2, dx * s + (rnd() - 0.5) * 0.5, dy * s - 0.25 - rnd() * 0.3, 44 + rnd() * 30, (4 + rnd() * 3) * size, 'grey'); p.grow = 0.2 * size; p.drag = 0.94; p.g = -0.018; p.a = 0.42; }
  }
  function sparks(x, y, n, v, col) {
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, s = 1.5 + rnd() * (2 + v * 0.35), p = spawn(SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s - 1, 9 + rnd() * 9, 0.9 + rnd() * 0.7, col || (i & 1 ? '#ffd257' : '#fff3c4')); p.g = 0.14; p.drag = 0.95; }
  }
  const KIND = { splinter: SPLINTER, chip: CHIP, shard: SHARD };
  function chips(x, y, n, spec, v, nx, ny) {     // bits of the block, thrown mostly along nx, ny
    const kind = KIND[spec.shape];
    for (let i = 0; i < n; i++) {
      const s = 1.2 + rnd() * (1.5 + v * 0.3), a = Math.atan2(ny, nx) + (rnd() - 0.5) * 2.4;
      const p = spawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s - 1.2, 26 + rnd() * 22, kind === SPLINTER ? 3.5 + rnd() * 4 : 1.6 + rnd() * 2.2, spec.cols[i % spec.cols.length]);
      p.g = 0.2; p.vr = (rnd() - 0.5) * 0.6;
    }
  }
  function shatter(x, y, w, h, ang, spec) {      // a glass block going: shards fly outward with spin
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0; i < spec.n; i++) {
      const lx = (rnd() - 0.5) * w, ly = (rnd() - 0.5) * h, ox = lx * c - ly * s, oy = lx * s + ly * c, d = Math.hypot(ox, oy) || 1, sp = 1.6 + rnd() * 3.2;
      const p = spawn(SHARD, x + ox, y + oy, ox / d * sp + (rnd() - 0.5), oy / d * sp - 1.6 - rnd(), 36 + rnd() * 26, 3.5 + rnd() * 4.5, spec.cols[i % spec.cols.length]);
      p.g = 0.24; p.vr = (rnd() - 0.5) * 0.5;
    }
    sparks(x, y, 3, 2, '#ffffff');
  }
  const DEBRIS = { shape: 'chip', cols: ['#3b2a26', '#c8372a', '#ffb23e'] };
  function boom(x, y) {                          // TNT: flash ring, glow, debris, smoke
    let p = spawn(RING, x, y, 0, 0, 14, 12, '#ffb23e'); p.grow = 6.5; p.a = 0.95;
    p = spawn(RING, x, y, 0, 0, 9, 6, '#fff3c4'); p.grow = 5;
    p = spawn(PUFF, x, y, 0, 0, 11, 40, 'warm'); p.grow = 3.5; p.a = 1; p.drag = 1;
    chips(x, y, 10, DEBRIS, 14, 0, -1); sparks(x, y, 12, 14);
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.283, s = 0.6 + rnd() * 1.6; p = spawn(PUFF, x + Math.cos(a) * 8, y + Math.sin(a) * 8, Math.cos(a) * s, Math.sin(a) * s - 0.5, 46 + rnd() * 30, 7 + rnd() * 6, i % 3 ? 'dark' : 'grey'); p.grow = 0.3; p.drag = 0.94; p.g = -0.02; p.a = 0.6; }
  }
  function ring(x, y, col, life, r, grow) { const p = spawn(RING, x, y, 0, 0, life, r, col); p.grow = grow; p.a = 0.9; }
  const PARTY = ['#ffd257', '#f2efe6', '#7fd1ae', '#ff8a5c'];
  function confetti(x, y, w, n) {
    for (let i = 0; i < n; i++) { const a = -rnd() * 3.1416, s = 3 + rnd() * 8, p = spawn(CHIP, x + (rnd() - 0.5) * w, y, Math.cos(a) * s, Math.sin(a) * s, 60 + rnd() * 50, 2.5 + rnd() * 2, PARTY[i % 4]); p.g = 0.16; p.vr = (rnd() - 0.5) * 0.4; }
  }

  // ---- once per drawn frame ----
  function update(k) {            // k = game time since the last frame, in 60ths of a second
    budget = PER_FRAME;
    if (flashN > 0 && k > 0) flashN--;
    if (k <= 0) return;
    for (let i = 0; i < CAP; i++) {
      const p = pool[i]; if (!p.on) continue;
      p.life -= k; if (p.life <= 0) { p.on = false; alive--; continue; }
      p.x += p.vx * k; p.y += p.vy * k; p.vy += p.g * k; p.vx *= p.drag; if (p.kind === PUFF) p.vy *= p.drag;
      p.r += p.grow * k; p.rot += p.vr * k;
      if (p.y > floor && p.g > 0 && p.life > 5) p.life = 5;        // bits that reach the ground fade there instead of falling through it
    }
  }
  function draw(ctx) {
    for (let i = 0; i < CAP; i++) {
      const p = pool[i]; if (!p.on) continue;
      const f = p.life / p.max, x = p.x, y = p.y, r = p.r;
      if (p.kind === PUFF) { ctx.globalAlpha = p.a * Math.min(1, f * 1.6); ctx.drawImage(PUFFS[p.col], x - r, y - r, r * 2, r * 2); continue; }
      ctx.globalAlpha = p.a * Math.min(1, f * 2.5);
      if (p.kind === RING) { ctx.strokeStyle = p.col; ctx.lineWidth = 1 + 4 * f; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke(); continue; }
      if (p.kind === SPARK) { ctx.strokeStyle = p.col; ctx.lineWidth = r; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * 1.6, y - p.vy * 1.6); ctx.stroke(); continue; }
      const c = Math.cos(p.rot), s = Math.sin(p.rot); ctx.fillStyle = p.col; ctx.beginPath();
      if (p.kind === SHARD) { ctx.moveTo(x + c * r, y + s * r); ctx.lineTo(x - c * r * 0.5 - s * r * 0.55, y - s * r * 0.5 + c * r * 0.55); ctx.lineTo(x - c * r * 0.7 + s * r * 0.3, y - s * r * 0.7 - c * r * 0.3); }
      else { const hw = r, hh = p.kind === SPLINTER ? 0.9 : r * 0.8;       // a thin stick or a small block
        ctx.moveTo(x + c * hw - s * hh, y + s * hw + c * hh); ctx.lineTo(x - c * hw - s * hh, y - s * hw + c * hh); ctx.lineTo(x - c * hw + s * hh, y - s * hw - c * hh); ctx.lineTo(x + c * hw + s * hh, y + s * hw - c * hh); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function clear() { for (let i = 0; i < CAP; i++) pool[i].on = false; alive = 0; shMag = 0; slowT = 0; slowUsed = false; kickT = -1; flashN = 0; seed = 2463534242; }

  // ---- camera: shake (world only) and one slow moment per shot ----
  let shMag = 0, shT = 0, slowT = 0, slowUsed = false, slowCount = 0;
  function shake(a) { if (!reduced) shMag = Math.max(shMag, Math.min(5, a)); }
  function cam(dt) {              // dt = real milliseconds
    shT += dt; shMag *= Math.exp(-dt / 65); if (shMag < 0.12) shMag = 0;      // gone in about 200 ms
    if (kickT >= 0) { kickT += dt; if (kickT >= KICK_MS) kickT = -1; }
    if (slowT > 0) { slowT -= dt; return 0.35; }
    return 1;
  }
  function bigEvent() { if (reduced || slowUsed) return false; slowUsed = true; slowT = 400; slowCount++; return true; }

  // ---- cannon: kick back along the barrel, flash, smoke ----
  const KICK_MS = 250;
  let kickT = -1, kickAmp = 0, flashN = 0, flashPow = 0;
  function fired(power, mx, my, dx, dy) {
    slowUsed = false; kickT = 0; kickAmp = 5 + 9 * power; flashN = 4; flashPow = power;
    smoke(mx + dx * 6, my + dy * 6, dx, dy, 3 + Math.round(power * 3), 0.8 + power * 0.5);
  }

  const stats = { alive: 0, peak: 0, cap: CAP, shake: 0, slows: 0, reduced: false };
  CC.fx = {
    CAP, rnd, dust, smoke, sparks, chips, shatter, boom, ring, confetti, update, draw, clear, shake, cam, bigEvent, fired, PUFFS,
    shakeX() { return shMag * Math.sin(shT * 0.11); }, shakeY() { return shMag * 0.8 * Math.cos(shT * 0.17); },
    kick() { if (kickT < 0) return 0; const u = 1 - kickT / KICK_MS; return kickAmp * u * u * u; },
    flash() { return flashN > 3 ? 0 : flashN; }, flashPow() { return flashPow; },
    isReduced() { return reduced; }, setFloor(y) { floor = y; },
    stats() { stats.alive = alive; stats.peak = peak; stats.shake = shMag; stats.slows = slowCount; stats.reduced = reduced; return stats; },
    resetPeak() { peak = alive; slowCount = 0; }
  };
})();
