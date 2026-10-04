/* Cannon Collapse (rough version). Plain boxes on purpose: this build is about feel. */
(function () {
  'use strict';
  const M = window.Matter, Engine = M.Engine, Bodies = M.Bodies, Body = M.Body, Composite = M.Composite,
    Events = M.Events, Sleeping = M.Sleeping, Common = M.Common;
  const LEVELS = window.LEVELS, SETS = window.SETS, Constraint = M.Constraint;

  // ---- tuning (all speeds are pixels per 1/60 s) ----
  const W = 360, GROUND = 560, DT = 1000 / 120, GRAV = 1.15, G60 = 0.001 * GRAV * (1000 / 60) * (1000 / 60);
  const CANNON = { x: 46, y: 496, len: 32 };
  const VMIN = 5, VMAX = 18.5, PULL_FULL = 120, ARC_LEN = 125;
  const MAT = {
    wood: { density: 0.0008, friction: 0.3, restitution: 0.08 },
    stone: { density: 0.003, friction: 0.8, restitution: 0.02 },
    glass: { density: 0.001, friction: 0.25, restitution: 0.05 },
    tnt: { density: 0.001, friction: 0.5, restitution: 0.05 },
    ice: { density: 0.0009, friction: 0.02, restitution: 0.03 }
  };
  const BALL = { n: { r: 10, density: 0.006, speed: 1 }, h: { r: 13.5, density: 0.011, speed: 0.92 } };
  const GLASS_BREAK = 4.5, TNT_TRIGGER = 3.5, TNT_R = 125, TNT_PUSH = 17;
  const MIN_GAP = 60, SETTLE_MIN = 120, SETTLE_QUIET = 40, SETTLE_CAP = 480;

  // ---- saved progress (works with storage blocked) ----
  // Stars are kept per level id. A save from the 10-level version (stars as a list) is mapped across by each level's `was` number.
  const KEY = 'cannon-collapse-v1', NEED = 15;
  let save = { v: 2, stars: {}, muted: false, at: null }, cheat = false;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      save.muted = !!s.muted;
      const old = Array.isArray(s.stars), src = s.stars && typeof s.stars === 'object' ? s.stars : {};
      for (const l of LEVELS) { const n = (old ? (typeof l.was === 'number' ? src[l.was] : 0) : src[l.id]) | 0; if (n > 0) save.stars[l.id] = Math.min(3, n); }
      if (typeof s.at === 'string') save.at = s.at;
    }
  } catch (e) { /* blocked or damaged: start fresh */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* blocked */ } }
  const setIdx = SETS.map((_, k) => LEVELS.map((l, i) => (l.set === k + 1 ? i : -1)).filter(i => i >= 0));
  function starsOf(i) { return save.stars[LEVELS[i].id] || 0; }
  function setStars(k) { return setIdx[k].reduce((a, i) => a + starsOf(i), 0); }
  function totalStars() { return LEVELS.reduce((a, l, i) => a + starsOf(i), 0); }
  function setOpen(k) { return cheat || k === 0 || setStars(k - 1) >= NEED; }
  function open(i) { const k = LEVELS[i].set - 1, j = setIdx[k].indexOf(i); return cheat || (setOpen(k) && (j === 0 || starsOf(setIdx[k][j - 1]) > 0)); }

  // ---- state ----
  let engine, S, headless = false, particles = [], floaters = [];
  let shake = 0, hitStop = 0, slowLeft = 0, speed = 1, winSlow = 0, lastShot = null, overTimer = 0;
  const $ = id => document.getElementById(id);
  const canvas = $('c'), ctx = canvas.getContext('2d');

  /* src = a level number, or a level object (the lab passes objects). */
  function build(src) {
    Common._nextId = 0; Common._seed = 0;
    const byNum = typeof src === 'number', L = byNum ? LEVELS[src] : src, p = L.platform, top = p.top || 390;
    engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = GRAV;
    const st = { isStatic: true, friction: 0.7 };
    const ground = Bodies.rectangle(W / 2 + 300, GROUND + 50, 1800, 100, st);
    // platform top: one slab, or split where an ice section starts and ends
    const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, ice = p.ice === true ? [-p.w / 2, p.w / 2] : (Array.isArray(p.ice) ? p.ice : null), segs = [];
    if (ice) { const a = Math.max(x0, p.x + ice[0]), b = Math.min(x1, p.x + ice[1]); if (a > x0 + 1) segs.push([x0, a, false]); segs.push([a, b, true]); if (b < x1 - 1) segs.push([b, x1, false]); }
    else segs.push([x0, x1, false]);
    const slabs = segs.map(g => Bodies.rectangle((g[0] + g[1]) / 2, top + 7, g[1] - g[0], 14, { isStatic: true, friction: g[2] ? MAT.ice.friction : 0.7 }));
    const pw = Math.max(26, p.w * 0.34);
    const pillar = Bodies.rectangle(p.x, (top + 14 + GROUND) / 2, pw, GROUND - top - 14, st);
    const blocks = [], props = [], extra = [], posts = []; let towerTop = top;
    L.blocks.forEach(b => {
      const m = MAT[b.m], x = p.x + b.x, y = top - b.y - b.h / 2;
      const body = Bodies.rectangle(x, y, b.w, b.h, { density: m.density, friction: m.friction, frictionStatic: 0.7, restitution: m.restitution });
      body.plugin = { mat: b.m, w: b.w, h: b.h, cleared: false, gone: false, hx: x, hy: y, flash: 0 };
      towerTop = Math.min(towerTop, y - b.h / 2);
      if (b.pin) {            // a plank that turns on a fixed pivot at its centre; it is furniture, not a block to clear
        body.plugin.prop = 'pin'; body.collisionFilter.group = -7; body.sleepThreshold = Infinity;
        extra.push(Constraint.create({ pointA: { x, y }, bodyB: body, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1 }));
        if (b.y > 2) { const post = Bodies.rectangle(x, top - b.y / 2, 8, b.y, st); post.collisionFilter.group = -7; extra.push(post); posts.push({ x, y: top - b.y }); }
        props.push(body);
      } else if (b.rope) {    // a weight hanging from a fixed point; also furniture
        const ax = p.x + b.rope[0], ay = top - b.rope[1];
        body.plugin.prop = 'rope'; body.plugin.ax = ax; body.plugin.ay = ay; body.frictionAir = 0.008; body.sleepThreshold = Infinity;
        extra.push(Constraint.create({ pointA: { x: ax, y: ay }, bodyB: body, pointB: { x: 0, y: -b.h / 2 }, stiffness: 1 }));
        towerTop = Math.min(towerTop, ay - 8); props.push(body);
      } else blocks.push(body);
    });
    Composite.add(engine.world, [ground, pillar].concat(slabs, blocks, props, extra));
    S = { level: byNum ? src : -1, L, top, towerTop, plat: { x: p.x, w: p.w, pw, segs }, blocks, props, posts, balls: [], ammo: L.shots.slice(), sel: 0, used: 0,
      phase: 'aim', near: false, tick: 0, lastFire: -9999, quiet: 0, settled: false, queue: null, stars: 0,
      pendBreak: [], pendBoom: [], remaining: blocks.length };
    Events.on(engine, 'collisionStart', onCollide);
    for (let k = 0; k < 150; k++) Engine.update(engine, DT);   // let the tower take its weight before anyone looks
    particles = []; floaters = []; shake = 0; hitStop = 0; slowLeft = 1.6; winSlow = 0; speed = 1;
  }

  function relSpeed(pair) {
    const a = Body.getVelocity(pair.bodyA), b = Body.getVelocity(pair.bodyB), n = pair.collision.normal;
    return Math.abs((a.x - b.x) * n.x + (a.y - b.y) * n.y);
  }
  function onCollide(ev) {
    for (const pair of ev.pairs) {
      const A = pair.bodyA, B = pair.bodyB, pa = A.plugin, pb = B.plugin, v = relSpeed(pair);
      if (pa.ball) pa.hit = true; if (pb.ball) pb.hit = true;
      if (v < 0.8) continue;
      const blk = pa.mat ? A : (pb.mat ? B : null), other = blk === A ? B : A;
      const ballHit = !!(pa.ball || pb.ball);
      if (blk) {
        const bp = blk.plugin, op = other.plugin;
        const hard = v * (op.ball && op.type === 'h' ? 1.5 : 1);
        if (bp.mat === 'glass' && hard > GLASS_BREAK && !bp.gone) {
          bp.gone = true; S.pendBreak.push(blk); pair.isActive = false;
          if (op.ball) Body.setVelocity(other, { x: Body.getVelocity(other).x * 0.72, y: Body.getVelocity(other).y * 0.72 });
        } else if (bp.mat === 'tnt' && hard > TNT_TRIGGER && !bp.gone) { bp.gone = true; S.pendBoom.push(blk); }
        if (op.mat === 'glass' && v > GLASS_BREAK && !op.gone) { op.gone = true; S.pendBreak.push(other); pair.isActive = false; }
        if (op.mat === 'tnt' && v > TNT_TRIGGER && !op.gone) { op.gone = true; S.pendBoom.push(other); }
      }
      if (headless) continue;
      const pt = (pair.collision.supports && pair.collision.supports[0]) || A.position;
      if (blk && !blk.plugin.gone) {
        const mat = (pa.mat === 'stone' || pb.mat === 'stone') ? 'stone' : (blk.plugin.mat === 'wood' ? 'wood' : 'stone');
        if (v > 1.2) play(mat, Math.min(1, v / 11), mat === 'wood' ? 0.8 + 16 / Math.max(20, blk.plugin.w) * 0.5 : 0.9 + Math.random() * 0.2);
        blk.plugin.flash = Math.min(1, v / 8);
      } else if (!blk && v > 3) play('stone', Math.min(0.5, v / 22), 1.3);
      if (ballHit && blk && v > 4) {
        shake = Math.max(shake, Math.min(9, v * 0.7)); hitStop = Math.max(hitStop, v > 8 ? 60 : 35);
        dust(pt.x, pt.y, Math.min(10, v | 0), '#f2efe6');
        if (v > 6) buzz(v > 10 ? 30 : 15);
      } else if (v > 5 && blk) { dust(pt.x, pt.y, 4, '#b9b3a3'); shake = Math.max(shake, 2.5); }
    }
  }

  function wakeAll() { for (const b of S.blocks) if (!b.plugin.gone) Sleeping.set(b, false); }
  function removeBlock(b) { b.plugin.gone = true; b.plugin.cleared = true; Composite.remove(engine.world, b); }
  function explode(t) {
    const c = t.position; removeBlock(t);
    for (const b of S.blocks.concat(S.props, S.balls)) {
      if (b === t || b.plugin.gone) continue;
      let dx = b.position.x - c.x, dy = b.position.y - c.y; const d = Math.hypot(dx, dy) || 1;
      if (d > TNT_R) continue;
      const f = 1 - d / TNT_R; dx /= d; dy = dy / d - 0.45; const n = Math.hypot(dx, dy) || 1;
      const k = TNT_PUSH * f * Math.min(1, 1.1 / Math.pow(b.mass, 0.76));
      Sleeping.set(b, false);
      const v = Body.getVelocity(b);
      Body.setVelocity(b, { x: v.x + dx / n * k, y: v.y + dy / n * k });
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (dx >= 0 ? 1 : -1) * 0.06 * f);
      if (b.plugin.mat === 'glass' && f > 0.35 && S.pendBreak.indexOf(b) < 0) { S.pendBreak.push(b); }
      if (b.plugin.mat === 'tnt' && f > 0.3 && S.pendBoom.indexOf(b) < 0) { S.pendBoom.push(b); }
    }
    if (!headless) {
      play('tnt', 1, 1); shake = 14; hitStop = 90; buzz(60);
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = 2 + Math.random() * 7;
        particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 30 + Math.random() * 25, r: 3 + Math.random() * 5, c: i % 3 ? '#ffb23e' : '#fff3c4', g: 0.1 }); }
      floaters.push({ x: c.x, y: c.y, r: 10, ring: true, life: 18 });
    }
  }
  function shatter(b) {
    const c = b.position, p = b.plugin; removeBlock(b);
    if (headless) return;
    play('glass', 0.9, 0.9 + Math.random() * 0.25); shake = Math.max(shake, 4); buzz(12);
    for (let i = 0; i < 14; i++) particles.push({ x: c.x + (Math.random() - 0.5) * p.w, y: c.y + (Math.random() - 0.5) * p.h,
      vx: (Math.random() - 0.3) * 5, vy: -Math.random() * 4, life: 35 + Math.random() * 25, r: 2 + Math.random() * 4, c: '#bfe9f5', g: 0.28, sq: true });
  }

  function canFire() { return S.phase === 'aim' && S.ammo.length > 0 && S.tick - S.lastFire >= MIN_GAP; }
  function fire(angleDeg, power, type) {
    if (!canFire()) return false;
    let idx = type ? S.ammo.indexOf(type) : Math.min(S.sel, S.ammo.length - 1);
    if (idx < 0) idx = 0;
    type = S.ammo[idx]; S.ammo.splice(idx, 1); S.sel = 0;
    const a = Math.max(-5, Math.min(85, angleDeg)) * Math.PI / 180, pw = Math.max(0, Math.min(1, power));
    const spec = BALL[type], v = (VMIN + (VMAX - VMIN) * pw) * spec.speed, dx = Math.cos(a), dy = -Math.sin(a);
    const ball = Bodies.circle(CANNON.x + dx * CANNON.len, CANNON.y + dy * CANNON.len, spec.r,
      { density: spec.density, friction: 0.4, frictionAir: 0, restitution: 0.22 });
    ball.plugin = { ball: true, type, born: S.tick, hit: false, trail: [] };
    Composite.add(engine.world, ball); Body.setVelocity(ball, { x: dx * v, y: dy * v });
    S.balls.push(ball); S.used++; S.lastFire = S.tick; S.quiet = 0; S.settled = false;
    if (!headless) { lastShot = { level: S.level, angle: angleDeg, power: pw, type }; play('launch', 0.5 + pw * 0.5, type === 'h' ? 0.78 : 1.05 - pw * 0.1); shake = Math.max(shake, 2 + pw * 3); buzz(10);
      dust(ball.position.x, ball.position.y, 7, '#f2efe6'); recoil = 1; renderAmmo(); setHint(); }
    return true;
  }
  let recoil = 0;

  function step() {
    Engine.update(engine, DT); S.tick++;
    let changed = false;
    while (S.pendBoom.length || S.pendBreak.length) {
      while (S.pendBreak.length) { const b = S.pendBreak.pop(); if (Composite.get(engine.world, b.id, 'body')) shatter(b); }
      if (S.pendBoom.length) { const b = S.pendBoom.shift(); if (Composite.get(engine.world, b.id, 'body')) explode(b); }
      changed = true;
    }
    if (changed) wakeAll();
    let remaining = 0, moving = false;
    for (const b of S.blocks) {
      const p = b.plugin;
      if (!p.cleared && (b.position.y > S.top + 5 || b.position.x < -30 || b.position.x > W + 30)) {
        p.cleared = true;
        if (!headless) floaters.push({ x: Math.max(20, Math.min(W - 20, b.position.x)), y: Math.min(b.position.y, S.top) - 6, text: '', pop: true, life: 22 });
      }
      if (p.cleared) continue;
      remaining++;
      if (!b.isSleeping && (Body.getSpeed(b) > 0.12 || Body.getAngularSpeed(b) > 0.004)) moving = true;
    }
    for (const b of S.props) if (Body.getSpeed(b) > 0.12 || Body.getAngularSpeed(b) > 0.004) moving = true;
    S.remaining = remaining;
    let flying = false;
    for (let i = S.balls.length - 1; i >= 0; i--) {
      const b = S.balls[i], p = b.plugin, pos = b.position;
      if (S.tick - p.born > 720 || pos.y > GROUND + 60 || pos.x < -80 || pos.x > W + 220) { Composite.remove(engine.world, b); S.balls.splice(i, 1); continue; }
      if (!p.hit) flying = true;
      else if (pos.y < S.top && Body.getSpeed(b) > 0.3) moving = true;
      if (!headless && (S.tick & 1)) { p.trail.push(pos.x, pos.y); if (p.trail.length > 36) p.trail.splice(0, 2); }
    }
    S.quiet = moving || flying ? 0 : S.quiet + 1;
    const since = S.tick - S.lastFire;
    S.settled = (since >= SETTLE_MIN && S.quiet >= SETTLE_QUIET) || since >= SETTLE_CAP;
    if (S.phase !== 'aim') return;
    if (remaining === 0) { win(); return; }
    if (S.ammo.length === 0 && S.settled) { lose(); return; }
    if (S.queue && S.queue.length && (S.used === 0 || S.settled)) { const q = S.queue.shift(); fire(q[0], q[1], q[2]); }
  }

  function starsFor(used, allowed) { const left = allowed - used; return used === 1 || left >= 2 ? 3 : (left === 1 ? 2 : 1); }
  function win() {
    S.phase = 'won'; S.stars = starsFor(S.used, S.L.shots.length);
    if (headless) return;
    save.stars[S.L.id] = Math.max(starsOf(S.level), S.stars); persist();
    winSlow = 450; play('clear', 0.9, 1); buzz([20, 40, 30]);
    for (let i = 0; i < 60; i++) { const a = -Math.random() * 3.1416, s = 3 + Math.random() * 8;
      particles.push({ x: S.plat.x + (Math.random() - 0.5) * S.plat.w, y: S.top - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 60 + Math.random() * 50,
        r: 3 + Math.random() * 3, c: ['#ffd257', '#f2efe6', '#7fd1ae', '#ff8a5c'][i % 4], g: 0.16, sq: true }); }
    clearTimeout(overTimer); overTimer = setTimeout(showOver, 650); setHint(); renderHud();
  }
  function lose() {
    S.phase = 'lost'; S.near = S.remaining <= 2;
    if (headless) return;
    if (S.near) { play('near', 0.8, 1); buzz(25); }
    showOver(); setHint();
  }

  // ---- overlay + HUD ----
  function starStr(n) { return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(3 - n) + '</span>'; }
  function showOver() {
    const o = $('over'), nx = S.level + 1, last = nx >= LEVELS.length, can = !last && open(nx);
    if (S.phase === 'won') {
      $('overStars').innerHTML = starStr(S.stars);
      let t = S.used === 1 ? 'Cleared in one shot.' : (S.stars === 3 ? 'Cleared with shots to spare.' : 'Cleared in ' + S.used + ' shots.');
      if (last) t = 'Cleared. That was the last one.';
      else if (!can) { const k = S.L.set; t = 'Cleared. ' + SETS[k] + ' opens at ' + NEED + ' stars here (' + setStars(k - 1) + ' so far).'; }
      $('overText').textContent = t;
      $('nextBtn').hidden = !last && !can; $('nextBtn').textContent = last ? 'Level 1' : 'Next'; $('again').className = $('nextBtn').hidden ? '' : 'minor';
    } else if (S.phase === 'lost') {
      $('overStars').innerHTML = '';
      const n = S.remaining, bl = n + (n === 1 ? ' block' : ' blocks') + ' left.';
      $('overText').textContent = S.near ? 'So close. ' + bl : 'Out of shots. ' + bl;
      $('nextBtn').hidden = true; $('again').className = '';
    } else return;
    o.hidden = false; $('ammo').style.visibility = 'hidden';
  }
  function hideOver() { clearTimeout(overTimer); $('over').hidden = true; $('ammo').style.visibility = ''; }
  function setHint() {
    $('hint').textContent = S.phase === 'aim' && S.ammo.length === 0 ? 'settling...' : '';
  }
  function renderHud() {
    const k = S.L.set - 1, j = setIdx[k].indexOf(S.level);
    $('lvlSet').textContent = SETS[k] + ','; $('lvlText').textContent = 'level ' + (j + 1) + ' of ' + setIdx[k].length;
    const st = starsOf(S.level); $('lvlStars').innerHTML = starStr(st);
    $('prev').disabled = S.level === 0; $('next').disabled = S.level >= LEVELS.length - 1 || !open(S.level + 1);
    $('mute').className = 'hb' + (save.muted ? ' off' : '');
    const bs = $('sets').querySelectorAll('.sb');
    bs.forEach((b, n) => { const ok = setOpen(n); b.className = 'sb' + (n === k ? ' cur' : '') + (ok ? '' : ' locked');
      b.setAttribute('aria-label', SETS[n] + (ok ? ', ' + setStars(n) + ' of ' + setIdx[n].length * 3 + ' stars' : ', locked')); });
    const t = $('total'); if (t) t.textContent = '★ ' + totalStars() + ' / ' + LEVELS.length * 3;
  }
  function renderAmmo() {
    const el = $('ammo'); el.innerHTML = '<span class="lab">Shots</span>';
    const mixed = S.ammo.indexOf('h') >= 0 && S.ammo.indexOf('n') >= 0;
    S.ammo.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.setAttribute('aria-label', (t === 'h' ? 'Heavy ball' : 'Normal ball') + (i === S.sel ? ', next up' : ''));
      if (i === S.sel) b.className = 'sel';
      b.innerHTML = '<span class="ball ' + t + '">' + (t === 'h' ? 'H' : '') + '</span>';
      b.addEventListener('click', () => { S.sel = i; renderAmmo(); });
      el.appendChild(b);
    });
    if (mixed) { const s = document.createElement('span'); s.className = 'lab'; s.textContent = 'tap to pick'; el.appendChild(s); }
  }
  function start(i) {
    hideOver(); build(i); aim = null; place(); renderHud(); renderAmmo(); setHint();
    if (save.at !== S.L.id) { save.at = S.L.id; persist(); }
  }

  // ---- sound (Web Audio, started on first touch) ----
  let actx = null, master = null; const SND = {}, lastPlay = {};
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      actx = new AC(); master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
      ['launch', 'wood', 'stone', 'glass', 'tnt', 'clear', 'near'].forEach(n => {
        fetch('sfx/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(buf => { SND[n] = buf; }).catch(() => {});
      });
    } catch (e) { actx = null; }
  }
  function play(n, vol, rate) {
    if (!actx || save.muted || !SND[n]) return;
    const now = actx.currentTime; if (lastPlay[n] && now - lastPlay[n] < 0.045) return; lastPlay[n] = now;
    try { const s = actx.createBufferSource(), g = actx.createGain(); s.buffer = SND[n]; s.playbackRate.value = rate || 1;
      g.gain.value = Math.max(0.05, Math.min(1, vol)); s.connect(g); g.connect(master); s.start(); } catch (e) { /* ignore */ }
  }
  function buzz(p) { if (save.muted) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }
  function dust(x, y, n, c) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.5 + Math.random() * 2.5;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.8, life: 14 + Math.random() * 14, r: 1.5 + Math.random() * 2.5, c, g: 0.05 }); }
  }

  // ---- view ----
  // The world never changes size. The view shows world x from XL to XL + VW, scaled to the screen width,
  // and slides up or down per level so the tower top sits just under the top bar and spare height becomes
  // ground under the thumb (not empty sky).
  const XL = 14, VW = 332, VH_MIN = 590, FOOT_MIN = 84;
  let scale = 1, oy = 0, VH = 640, dpr = 1, hudB = 80;
  function place() {
    const r = $('sets').getBoundingClientRect(), wr = $('wrap').getBoundingClientRect();
    hudB = Math.max(40, (r.bottom - wr.top) / scale);
    let g = GROUND + (hudB + VH * 0.085 - (S ? S.towerTop : 250));
    g = Math.max(VH * 0.7, Math.min(VH - FOOT_MIN, g)); oy = g - GROUND;
  }
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / VW, vh / VH_MIN); VH = vh / scale; dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = Math.round(VW * scale);
    $('wrap').style.width = cw + 'px'; canvas.style.width = cw + 'px'; canvas.style.height = vh + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(vh * dpr);
    place();
  }
  window.addEventListener('resize', resize);

  // ---- aiming: drag anywhere, pull back, let go ----
  let aim = null;
  function pt(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale + XL, y: (e.clientY - r.top) / scale - oy }; }
  function aimFrom(a) {
    const px = a.sx - a.x, py = a.sy - a.y, d = Math.hypot(px, py);
    a.power = Math.min(1, d / PULL_FULL);
    a.angle = d < 4 ? 30 : Math.max(-5, Math.min(85, Math.atan2(-py, Math.max(px, 0.001)) * 180 / Math.PI));
    a.live = d > 12;
  }
  canvas.addEventListener('pointerdown', e => {
    initAudio(); if (S.phase !== 'aim' || !S.ammo.length) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    const p = pt(e); aim = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, power: 0, angle: 30, live: false }; e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => { if (!aim || e.pointerId !== aim.id) return; const p = pt(e); aim.x = p.x; aim.y = p.y; aimFrom(aim); e.preventDefault(); });
  function release(e) {
    if (!aim || e.pointerId !== aim.id) return; const a = aim; aim = null;
    if (e.type === 'pointerup' && a.live && a.power > 0.06) fire(a.angle, a.power);
  }
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  document.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  function go(i) { if (i >= 0 && i < LEVELS.length && open(i)) start(i); }
  $('restart').addEventListener('click', () => { initAudio(); start(S.level); });
  $('again').addEventListener('click', () => { initAudio(); start(S.level); });
  $('nextBtn').addEventListener('click', () => { initAudio(); const n = S.level + 1; start(n >= LEVELS.length ? 0 : (open(n) ? n : S.level)); });
  $('prev').addEventListener('click', () => go(S.level - 1));
  $('next').addEventListener('click', () => go(S.level + 1));
  $('mute').addEventListener('click', () => { save.muted = !save.muted; persist(); initAudio(); renderHud(); });
  window.addEventListener('keydown', e => { if (e.key === 'r' || e.key === 'R') start(S.level); });
  function buildSetRow() {
    const el = $('sets'); el.innerHTML = '';
    SETS.forEach((name, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sb'; b.textContent = name.split(' ')[0];
      b.addEventListener('click', () => {
        if (!setOpen(k)) { flash(name + ' opens at ' + NEED + ' stars in ' + SETS[k - 1] + ' (' + setStars(k - 1) + ' so far)'); return; }
        const todo = setIdx[k].find(i => !starsOf(i)); start(todo === undefined ? setIdx[k][0] : todo);
      });
      el.appendChild(b);
    });
    const t = document.createElement('span'); t.id = 'total'; el.appendChild(t);
  }
  let flashTimer = 0;
  function flash(msg) { $('hint').textContent = msg; clearTimeout(flashTimer); flashTimer = setTimeout(setHint, 2600); }

  // ---- drawing ----
  const COL = { wood: '#d9a441', stone: '#8d939c', glass: 'rgba(150,215,238,0.5)', tnt: '#d8432f', ice: '#9fd4f0' };
  function drawBlock(b) {
    const p = b.plugin, w = p.w, h = p.h;
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    ctx.globalAlpha = p.cleared ? 0.38 : 1;
    ctx.fillStyle = COL[p.mat]; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = p.mat === 'stone' ? 3 : 2; ctx.strokeStyle = p.mat === 'glass' ? '#dff6ff' : '#1c2530';
    ctx.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(28,37,48,0.55)'; ctx.fillStyle = 'rgba(28,37,48,0.6)';
    if (p.mat === 'wood') {                       // grain lines along the long side
      ctx.beginPath();
      if (w >= h) { for (let k = 1; k <= 2; k++) { const y = -h / 2 + h * k / 3; ctx.moveTo(-w / 2 + 5, y); ctx.lineTo(w / 2 - 5, y); } }
      else { for (let k = 1; k <= 2; k++) { const x = -w / 2 + w * k / 3; ctx.moveTo(x, -h / 2 + 5); ctx.lineTo(x, h / 2 - 5); } }
      ctx.stroke();
    } else if (p.mat === 'stone') {               // speckles
      const n = Math.max(3, Math.round(w * h / 320));
      for (let k = 0; k < n; k++) { const fx = ((k * 37 + 11) % 100) / 100 - 0.5, fy = ((k * 61 + 29) % 100) / 100 - 0.5; ctx.fillRect(fx * (w - 12) - 1.5, fy * (h - 12) - 1.5, 3, 3); }
    } else if (p.mat === 'glass') {               // shine streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); const s = Math.min(w, h) * 0.5;
      ctx.moveTo(-w / 2 + 3, -h / 2 + 3 + s); ctx.lineTo(-w / 2 + 3 + s, -h / 2 + 3); ctx.stroke();
    } else if (p.mat === 'ice') {                 // two pale slashes
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); const s = Math.min(w, h) * 0.45;
      ctx.moveTo(-s / 2, s / 4); ctx.lineTo(s / 4, -s / 2); ctx.moveTo(-s / 6, s / 2); ctx.lineTo(s / 2, -s / 6); ctx.stroke();
    } else {                                      // TNT label
      ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.min(12, w * 0.4) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', 0, 1);
    }
    if (p.prop === 'pin') { ctx.beginPath(); ctx.arc(0, 0, 4, 0, 6.2832); ctx.fillStyle = '#1c2530'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f2efe6'; ctx.stroke(); }
    if (p.flash > 0.02) { ctx.globalAlpha = p.flash * 0.7; ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2, -h / 2, w, h); p.flash *= 0.8; }
    ctx.restore();
  }
  function drawBall(x, y, type, alpha) {
    const r = BALL[type].r; ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = type === 'h' ? '#3b3f46' : '#f2efe6'; ctx.fill();
    ctx.lineWidth = type === 'h' ? 3 : 2; ctx.strokeStyle = type === 'h' ? '#f2efe6' : '#1c2530'; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function arc(angle, power, type, style, maxLen) {
    const a = angle * Math.PI / 180, v = (VMIN + (VMAX - VMIN) * power) * BALL[type].speed;
    const x0 = CANNON.x + Math.cos(a) * CANNON.len, y0 = CANNON.y - Math.sin(a) * CANNON.len, vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
    ctx.fillStyle = style; let len = 0, lx = x0, ly = y0, next = 10, k = 0;
    for (let t = 0.25; t < 60 && len < maxLen; t += 0.25) {
      const x = x0 + vx * t, y = y0 + vy * t + 0.5 * G60 * t * t; len += Math.hypot(x - lx, y - ly); lx = x; ly = y;
      if (len >= next) { next += 10; k++; const f = 1 - len / maxLen; ctx.globalAlpha = 0.25 + 0.75 * f; ctx.beginPath(); ctx.arc(x, y, 1.6 + 1.6 * f, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    const cw = canvas.width, ch = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#1c2530'; ctx.fillRect(0, 0, cw, ch);
    const sx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    // plain backdrop, fixed to the screen: lighter towards the horizon, a few flat clouds, far hills
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -XL * dpr * scale, oy * dpr * scale);
    const skyTop = -oy, sky = ctx.createLinearGradient(0, skyTop, 0, GROUND); sky.addColorStop(0, '#141b24'); sky.addColorStop(1, '#2b3c4d');
    ctx.fillStyle = sky; ctx.fillRect(0, skyTop, W, GROUND - skyTop);
    const span = GROUND - skyTop - hudB; ctx.fillStyle = 'rgba(242,239,230,0.055)';
    [[60, 0.16, 96], [250, 0.3, 70], [150, 0.52, 120], [300, 0.66, 60]].forEach(c => { const y = skyTop + hudB + span * c[1]; ctx.fillRect(c[0] - c[2] / 2, y, c[2], 12); ctx.fillRect(c[0] - c[2] / 4, y - 9, c[2] / 2, 9); });
    ctx.fillStyle = '#263442'; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(40, GROUND - 46); ctx.lineTo(120, GROUND - 46); ctx.lineTo(170, GROUND - 18); ctx.lineTo(230, GROUND - 64); ctx.lineTo(300, GROUND - 64); ctx.lineTo(W, GROUND - 20); ctx.lineTo(W, GROUND); ctx.closePath(); ctx.fill();
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (sx - XL) * dpr * scale, (oy + sy) * dpr * scale);
    // ground
    ctx.fillStyle = '#2c3a33'; ctx.fillRect(-20, GROUND, W + 40, VH); ctx.fillStyle = '#44584d'; ctx.fillRect(-20, GROUND, W + 40, 4);
    // platform (ice sections are pale blue)
    const P = S.plat; ctx.fillStyle = '#56606e'; ctx.fillRect(P.x - P.pw / 2, S.top + 14, P.pw, GROUND - S.top - 14);
    for (const g of P.segs) { ctx.fillStyle = g[2] ? '#bfe6fa' : '#c9c4b6'; ctx.fillRect(g[0], S.top, g[1] - g[0], 14); if (g[2]) { ctx.fillStyle = '#fff'; ctx.fillRect(g[0], S.top, g[1] - g[0], 3); } }
    ctx.fillStyle = '#1c2530'; ctx.fillRect(P.x - P.w / 2, S.top + 11, P.w, 3);
    // last shot marker (so a retry can be a correction, not a guess)
    const aiming = aim && aim.live, curType = S.ammo[Math.min(S.sel, S.ammo.length - 1)] || 'n';
    if (lastShot && lastShot.level === S.level && S.phase === 'aim' && S.used === 0) arc(lastShot.angle, lastShot.power, lastShot.type, '#6f7c8c', 70);
    if (aiming) arc(aim.angle, aim.power, curType, '#ffd257', ARC_LEN);
    // blocks, balls
    // pivots, ropes, blocks, balls
    for (const q of S.posts) { ctx.fillStyle = '#56606e'; ctx.beginPath(); ctx.moveTo(q.x - 11, S.top); ctx.lineTo(q.x + 11, S.top); ctx.lineTo(q.x + 3, q.y); ctx.lineTo(q.x - 3, q.y); ctx.closePath(); ctx.fill(); }
    for (const b of S.props) {
      const p = b.plugin; if (p.prop !== 'rope' || p.gone) continue;
      const c = Math.cos(b.angle), s = Math.sin(b.angle), tx = b.position.x + s * p.h / 2, ty = b.position.y - c * p.h / 2;
      ctx.strokeStyle = 'rgba(201,196,182,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.ax, -oy + hudB + 4); ctx.stroke();
      ctx.strokeStyle = '#c9c4b6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.ax, p.ay, 5, 0, 6.2832); ctx.fillStyle = '#c9c4b6'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1c2530'; ctx.stroke();
    }
    for (const b of S.props) if (!b.plugin.gone) drawBlock(b);
    for (const b of S.blocks) if (!b.plugin.gone) drawBlock(b);
    for (const b of S.balls) {
      const t = b.plugin.trail; for (let i = 0; i < t.length; i += 2) { ctx.globalAlpha = 0.04 + 0.25 * i / t.length; ctx.fillStyle = '#f2efe6'; ctx.beginPath(); ctx.arc(t[i], t[i + 1], BALL[b.plugin.type].r * (0.3 + 0.6 * i / t.length), 0, 6.2832); ctx.fill(); }
      drawBall(b.position.x, b.position.y, b.plugin.type, 1);
    }
    // cannon
    const ang = aiming ? aim.angle : (lastShot && lastShot.level === S.level ? lastShot.angle : 30), ar = ang * Math.PI / 180;
    ctx.fillStyle = '#56606e'; ctx.fillRect(CANNON.x - 16, CANNON.y + 6, 32, GROUND - CANNON.y - 6);
    ctx.save(); ctx.translate(CANNON.x, CANNON.y); ctx.rotate(-ar);
    const rc = recoil * 7 + (aiming ? aim.power * 5 : 0); recoil *= 0.86;
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(-12 - rc, -9, CANNON.len + 12, 18); ctx.fillStyle = '#1c2530'; ctx.fillRect(CANNON.len - 5 - rc, -9, 3, 18);
    ctx.restore();
    ctx.beginPath(); ctx.arc(CANNON.x, CANNON.y + 4, 12, 0, 6.2832); ctx.fillStyle = '#ffd257'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1c2530'; ctx.stroke();
    if (aiming) {   // power bar by the cannon + the pull itself under the thumb
      ctx.fillStyle = 'rgba(242,239,230,0.25)'; ctx.fillRect(CANNON.x - 22, CANNON.y + 34, 44, 6); ctx.fillStyle = '#ffd257'; ctx.fillRect(CANNON.x - 22, CANNON.y + 34, 44 * aim.power, 6);
      ctx.strokeStyle = 'rgba(242,239,230,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(aim.sx, aim.sy); ctx.lineTo(aim.x, aim.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(aim.sx, aim.sy, 5, 0, 6.2832); ctx.fillStyle = 'rgba(242,239,230,0.6)'; ctx.fill();
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 13 + aim.power * 6, 0, 6.2832); ctx.stroke();
    }
    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.985; p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life / 18); ctx.fillStyle = p.c;
      if (p.sq) ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill(); }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.life--; if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = f.life / 22; ctx.strokeStyle = f.ring ? '#fff3c4' : '#7fd1ae'; ctx.lineWidth = f.ring ? 5 : 3;
      const r = f.ring ? 10 + (18 - f.life) * 7 : 6 + (22 - f.life) * 1.2; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // text on the field
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (S.L.tip && S.used === 0 && !aiming && S.phase === 'aim') { ctx.fillStyle = '#f2efe6'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillText(S.L.tip, XL + VW / 2, -oy + hudB + 30); }
    if (S.phase === 'aim' && S.remaining > 0 && S.used > 0) {
      ctx.fillStyle = S.remaining <= 2 ? '#ffd257' : 'rgba(242,239,230,0.7)'; ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(S.remaining + (S.remaining === 1 ? ' block left' : ' blocks left'), Math.min(S.plat.x, W - 62), GROUND + 24);
    }
    shake *= 0.86;
  }

  // ---- main loop: fixed physics step, same on fast and slow phones ----
  let last = 0, acc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    let dt = Math.min(50, t - last || 16); last = t;
    if (hitStop > 0) { hitStop -= dt; dt = 0; }
    let target = 1;
    if (S.phase === 'aim' && S.ammo.length === 0 && S.remaining > 0 && S.remaining <= 2 && S.quiet === 0 && slowLeft > 0 && S.tick - S.lastFire > 30) { target = 0.35; slowLeft -= dt / 1000; }
    if (winSlow > 0) { target = 0.25; winSlow -= dt; }
    speed += (target - speed) * 0.25;
    acc += dt * speed; let n = 0;
    while (acc >= DT && n < 8) { step(); acc -= DT; n++; }
    if (n === 8) acc = 0;
    draw();
  }

  // ---- test hook (used by tools/play-check.mjs) ----
  // ---- test hook (used by tools/play-check.mjs and tools/level-lab.mjs) ----
  // A level can be given as its number in LEVELS or as a level object (same shape as in levels.js).
  function allBodies() { return S.blocks.concat(S.props); }
  window.__cc = {
    levels: LEVELS.length, sets: SETS, need: NEED,
    fire, goto: start, restart: () => start(S.level),
    queue(shots) { S.queue = shots.map(s => s.slice()); },
    unlockAll() { cheat = true; renderHud(); },
    lockAgain() { cheat = false; renderHud(); },
    state() {
      const B = b => ({ m: b.plugin.mat, prop: b.plugin.prop || null, x: b.position.x, y: b.position.y, a: b.angle, hx: b.plugin.hx, hy: b.plugin.hy, cleared: b.plugin.cleared, gone: b.plugin.gone });
      return { level: S.level, id: S.L.id, set: S.L.set, phase: S.phase, near: S.near, remaining: S.remaining, total: S.blocks.length, shotsLeft: S.ammo.length, ammo: S.ammo.slice(),
        used: S.used, tick: S.tick, settled: S.settled, stars: S.stars, top: S.top, towerTop: S.towerTop, aiming: !!(aim && aim.live), aim: aim && { angle: aim.angle, power: aim.power },
        overlay: !$('over').hidden, overlayText: $('overText').textContent, hint: $('hint').textContent, lvlText: $('lvlText').textContent, total_stars: totalStars(),
        view: { scale, oy, VH, hudB, XL, VW, ground: GROUND },
        blocks: S.blocks.map(B), props: S.props.map(B) };
    },
    /* Run a whole attempt with no drawing or sound: shots = [[angle, power, type?], ...]. Leaves the level reset afterwards. */
    run(level, shots) {
      const keep = S.level; headless = true; build(level); S.queue = shots.map(s => s.slice());
      let guard = 0;
      while (S.phase === 'aim' && guard++ < 12000) { step(); if (!S.queue.length && S.used > 0 && S.settled) break; }
      const out = { phase: S.phase, remaining: S.remaining, used: S.used, ticks: S.tick };
      headless = false; build(keep); return out;
    },
    /* Leave a level alone for `ticks` physics steps (120 a second) and report the worst drift in pixels. */
    stand(level, ticks) {
      const keep = S.level; headless = true; build(level);
      const all = allBodies(), a = all.map(b => ({ x: b.position.x, y: b.position.y }));
      for (let k = 0; k < (ticks || 360); k++) step();
      let worst = 0;
      all.forEach((b, j) => { worst = Math.max(worst, Math.hypot(b.position.x - b.plugin.hx, b.position.y - b.plugin.hy), Math.hypot(b.position.x - a[j].x, b.position.y - a[j].y), Math.abs(b.angle) * 40); });
      const out = { worst, ok: worst < 2 && S.remaining === S.blocks.length, towerTop: S.towerTop };
      headless = false; build(keep); return out;
    }
  };

  buildSetRow(); resize();
  let first = LEVELS.findIndex(l => l.id === save.at); if (first < 0 || !open(first)) first = 0;
  start(first);
  requestAnimationFrame(frame);
})();
