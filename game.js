/* Cannon Collapse: physics, aiming, shots, settle and judge, stars, sound, saved progress, the main loop and the test hook.
   Drawing is in draw.js, effects in fx.js, material looks and sounds in materials.js (all loaded before this file). */
(function () {
  'use strict';
  const M = window.Matter, Engine = M.Engine, Bodies = M.Bodies, Body = M.Body, Composite = M.Composite,
    Events = M.Events, Sleeping = M.Sleeping, Common = M.Common;
  const LEVELS = window.LEVELS, SETS = window.SETS, Constraint = M.Constraint;
  const CC = window.CC, FX = CC.fx, LOOK = CC.MATERIALS;

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
  function starsOf(i) { return LEVELS[i] ? save.stars[LEVELS[i].id] || 0 : 0; }
  function setStars(k) { return setIdx[k].reduce((a, i) => a + starsOf(i), 0); }
  function totalStars() { return LEVELS.reduce((a, l, i) => a + starsOf(i), 0); }
  function setOpen(k) { return cheat || k === 0 || setStars(k - 1) >= NEED; }
  function open(i) { const k = LEVELS[i].set - 1, j = setIdx[k].indexOf(i); return cheat || (setOpen(k) && (j === 0 || starsOf(setIdx[k][j - 1]) > 0)); }

  // ---- state ----
  let engine, S, headless = false;
  let hitStop = 0, slowLeft = 0, speed = 1, winSlow = 0, lastShot = null, overTimer = 0;
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
      pendBreak: [], pendBoom: [], remaining: blocks.length, fell: [-999, -999, -999], rumbled: false };
    Events.on(engine, 'collisionStart', onCollide);
    for (let k = 0; k < 150; k++) Engine.update(engine, DT);   // let the tower take its weight before anyone looks
    hitStop = 0; slowLeft = 1.6; winSlow = 0; speed = 1; if (!headless) FX.clear();
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
        const hard = v * (other.plugin.ball && other.plugin.type === 'h' ? 1.5 : 1);
        struck(blk, other, pt, v, hard, ballHit);
        if (other.plugin.mat && !other.plugin.gone && !other.plugin.prop) damage(other, blk, pt, v, v, false);
      } else if (!blk && v > 3) { play('stone', Math.min(0.5, v / 22), 1.3); FX.dust(pt.x, pt.y, 2, 'tan', 0.7); }
      if (ballHit && blk && v > 4) {
        FX.shake(v * 0.4); hitStop = Math.max(hitStop, v > 8 ? 60 : 35);
        FX.sparks(pt.x, pt.y, Math.min(9, 2 + (v * 0.6 | 0)), v);
        if (v > 6) buzz(v > 10 ? 30 : 15);
      } else if (v > 5 && blk) FX.shake(1.5 + (blk.mass > 2 ? 1 : 0));
    }
  }
  // ---- what a hit looks and sounds like (never changes the physics) ----
  function struck(blk, other, pt, v, hard, ballHit) {
    const p = blk.plugin, T = LOOK[p.mat], big = hard > T.hardAt;
    if (v > 1.2) {       // pitch: small blocks ring higher, harder hits a little higher, and never quite the same twice
      const size = Math.sqrt(p.w * p.h), rate = T.rate * Math.max(0.8, Math.min(1.3, 1.3 - size / 95)) * (0.95 + Math.min(0.12, v * 0.008) + FX.rnd() * 0.08);
      play(big && T.hardSound ? T.hardSound : T.hit, Math.min(1, v / 11), rate);
    }
    p.flash = Math.min(1, v / 8);
    damage(blk, other, pt, v, hard, ballHit);
    if (other.isStatic && !ballHit && v > 2.2) FX.dust(pt.x, pt.y, Math.min(6, 2 + (v * blk.mass * 0.5 | 0)), p.mat === 'ice' ? 'frost' : 'tan', Math.min(1.9, 0.95 + blk.mass * 0.25));   // a block landing
  }
  function damage(blk, other, pt, v, hard, ballHit) {
    const p = blk.plugin, T = LOOK[p.mat]; if (hard <= T.hardAt) return;
    const dx = pt.x - blk.position.x, dy = pt.y - blk.position.y, c = Math.cos(-blk.angle), s = Math.sin(-blk.angle);
    CC.addMark(p, dx * c - dy * s, dx * s + dy * c, FX.rnd);
    const ox = pt.x - other.position.x, oy = pt.y - other.position.y, d = other.isStatic ? 0 : Math.hypot(ox, oy);
    if (T.chips) FX.chips(pt.x, pt.y, Math.min(T.chips.n, 2 + (v * 0.5 | 0)), T.chips, v, d ? ox / d : 0, d ? oy / d : -1);
    if (T.dust) FX.dust(pt.x, pt.y, ballHit ? 3 : 2, T.dust, 0.8);
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
    if (!headless) { play('tnt', 1, 0.95 + FX.rnd() * 0.1); FX.shake(5); hitStop = 90; buzz(60); FX.boom(c.x, c.y); FX.bigEvent(); }
  }
  function shatter(b) {
    const c = b.position, p = b.plugin; removeBlock(b);
    if (headless) return;
    play('glass', 0.9, 0.9 + FX.rnd() * 0.25); FX.shake(2.5); buzz(12);
    FX.shatter(c.x, c.y, p.w, p.h, b.angle, LOOK.glass.shards);
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
    ball.plugin = { ball: true, type, born: S.tick, hit: false, trail: null, th: 0, tn: 0, tcap: 0 };
    Composite.add(engine.world, ball); Body.setVelocity(ball, { x: dx * v, y: dy * v });
    S.balls.push(ball); S.used++; S.lastFire = S.tick; S.quiet = 0; S.settled = false;
    if (!headless) {
      const bp = ball.plugin; bp.tcap = 6 + Math.round(pw * 7); bp.trail = new Float32Array(bp.tcap * 2);     // a harder shot leaves a longer trail
      lastShot = { level: S.level, angle: angleDeg, power: pw, type }; S.fell[0] = S.fell[1] = S.fell[2] = -999; S.rumbled = false;
      play('launch', 0.55 + pw * 0.45, type === 'h' ? 0.8 : 1.06 - pw * 0.1); FX.shake(1 + pw * 1.5); buzz(10);
      FX.fired(pw, ball.position.x, ball.position.y, dx, dy); renderAmmo(); setHint();
    }
    return true;
  }

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
        if (!headless) fellOff(b);
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
      if (!headless && (S.tick & 1)) { p.trail[p.th * 2] = pos.x; p.trail[p.th * 2 + 1] = pos.y; p.th = (p.th + 1) % p.tcap; if (p.tn < p.tcap) p.tn++; }
    }
    if (!headless && S.tick - S.lastFire === MIN_GAP && S.ammo.length && S.phase === 'aim') play('reload', 0.5, 1);   // next ball is ready
    S.quiet = moving || flying ? 0 : S.quiet + 1;
    const since = S.tick - S.lastFire;
    S.settled = (since >= SETTLE_MIN && S.quiet >= SETTLE_QUIET) || since >= SETTLE_CAP;
    if (S.phase !== 'aim') return;
    if (remaining === 0) { win(); return; }
    if (S.ammo.length === 0 && S.settled) { lose(); return; }
    if (S.queue && S.queue.length && (S.used === 0 || S.settled)) { const q = S.queue.shift(); fire(q[0], q[1], q[2]); }
  }

  // A block has left the platform (live play only): a small ring, and if it is the third inside half a second, the one big moment of the shot.
  function fellOff(b) {
    FX.ring(Math.max(20, Math.min(W - 20, b.position.x)), Math.min(b.position.y, S.top) - 6, '#7fd1ae', 22, 6, 1.2);
    const f = S.fell; f[0] = f[1]; f[1] = f[2]; f[2] = S.tick;
    if (S.tick - f[0] <= 60 && !S.rumbled) { S.rumbled = true; play('rumble', 0.9, 0.95 + FX.rnd() * 0.1); FX.shake(3); buzz(40); FX.bigEvent(); }
  }

  function starsFor(used, allowed) { const left = allowed - used; return used === 1 || left >= 2 ? 3 : (left === 1 ? 2 : 1); }
  function win() {
    S.phase = 'won'; S.stars = starsFor(S.used, S.L.shots.length);
    if (headless) return;
    if (S.level >= 0) { save.stars[S.L.id] = Math.max(starsOf(S.level), S.stars); persist(); }
    winSlow = 450; play('clear', 0.9, 1); buzz([20, 40, 30]);
    for (let i = 0; i < S.stars; i++) play('star', 0.75, 1 + i * 0.122, 0.7 + i * 0.2);     // one chime per star, rising
    FX.confetti(S.plat.x, S.top - 10, S.plat.w, 44);
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
    if (S.level >= 0 && save.at !== S.L.id) { save.at = S.L.id; persist(); }
  }

  // ---- sound (Web Audio, started on first touch) ----
  let actx = null, master = null, started = 0; const SND = {}, lastPlay = {}, MAX_STARTS = 3;      // at most 3 new sounds per drawn frame
  const SOUNDS = ['launch', 'reload', 'wood', 'woodcrack', 'stone', 'clink', 'glass', 'ice', 'tnt', 'rumble', 'star', 'clear', 'near'];
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      actx = new AC(); master = actx.createGain(); master.gain.value = 0.9;
      const lim = actx.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.15;   // a pile of hits at once stays clean
      master.connect(lim); lim.connect(actx.destination);
      SOUNDS.forEach(n => {
        fetch('sfx/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(buf => { SND[n] = buf; }).catch(() => {});
      });
    } catch (e) { actx = null; }
  }
  function play(n, vol, rate, delay) {
    if (!actx || save.muted || !SND[n]) return;
    const now = actx.currentTime;
    if (!delay) { if (started >= MAX_STARTS || (lastPlay[n] && now - lastPlay[n] < 0.06)) return; lastPlay[n] = now; started++; }
    try { const s = actx.createBufferSource(), g = actx.createGain(); s.buffer = SND[n]; s.playbackRate.value = rate || 1;
      g.gain.value = Math.max(0.05, Math.min(1, vol)); s.connect(g); g.connect(master); s.start(now + (delay || 0)); } catch (e) { /* ignore */ }
  }
  function buzz(p) { if (save.muted) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }
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
    scale = Math.min(vw / VW, vh / VH_MIN); VH = vh / scale; dpr = Math.min(2, window.devicePixelRatio || 1);
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

  // ---- drawing (draw.js does it; G is the one object handed over, reused every frame) ----
  const G = { ctx, canvas, S: null, aim: null, lastShot: null, scale: 1, oy: 0, dpr: 1, VH: 640, hudB: 80,
    K: { W, GROUND, CANNON, BALL, XL, VW, VMIN, VMAX, G60, ARC_LEN } };
  FX.setFloor(GROUND + 2);
  function draw() { G.S = S; G.aim = aim; G.lastShot = lastShot; G.scale = scale; G.oy = oy; G.dpr = dpr; G.VH = VH; G.hudB = hudB; CC.draw(G); }

  // ---- main loop: fixed physics step, same on fast and slow phones ----
  let last = 0, acc = 0, frozen = false; const perf = { ms: 0, n: 0, worst: 0 };
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(50, t - last || 16); last = t;
    if (!frozen) tick(dt);
  }
  function tick(raw) {
    const t0 = performance.now(), calm = FX.isReduced(); let dt = raw;
    started = 0;
    if (hitStop > 0) { hitStop -= dt; dt = 0; }
    // Slow motion only changes how many fixed steps run per drawn frame, never the steps themselves.
    let target = FX.cam(raw);
    if (S.phase === 'aim' && S.ammo.length === 0 && S.remaining > 0 && S.remaining <= 2 && S.quiet === 0 && slowLeft > 0 && S.tick - S.lastFire > 30) { target = 0.35; slowLeft -= dt / 1000; }
    if (winSlow > 0) { target = 0.25; winSlow -= dt; }
    if (calm) target = 1;
    speed += (target - speed) * 0.25;
    acc += dt * speed; let n = 0;
    while (acc >= DT && n < 8) { step(); acc -= DT; n++; }
    if (n === 8) acc = 0;
    for (const b of S.blocks) { const p = b.plugin; if (p.flash > 0.02) p.flash *= 0.8; }
    for (const b of S.props) { const p = b.plugin; if (p.flash > 0.02) p.flash *= 0.8; }
    FX.update(dt * speed / (1000 / 60));
    draw();
    const ms = performance.now() - t0; perf.ms += ms; perf.n++; if (ms > perf.worst) perf.worst = ms;
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
    /* Looks: stop the clock (nothing moves or fades), then move on by whole frames. Used to take pictures of exact moments. */
    freeze(on) { frozen = !!on; },
    advance(frames) { for (let k = 0; k < (frames || 1); k++) tick(1000 / 60); },
    /* Frame cost and particle count since the last perfReset(). */
    perfReset() { perf.ms = 0; perf.n = 0; perf.worst = 0; FX.resetPeak(); },
    perf() { const f = FX.stats(); return { frames: perf.n, avgMs: perf.n ? perf.ms / perf.n : 0, worstMs: perf.worst, particles: f.alive, peak: f.peak, cap: f.cap, shake: f.shake, slows: f.slows, reduced: f.reduced, speed, dpr }; },
    lockAgain() { cheat = false; renderHud(); },
    state() {
      const B = b => ({ m: b.plugin.mat, prop: b.plugin.prop || null, x: b.position.x, y: b.position.y, a: b.angle, hx: b.plugin.hx, hy: b.plugin.hy, cleared: b.plugin.cleared, gone: b.plugin.gone, marks: b.plugin.marks ? b.plugin.marks.length : 0 });
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
