// Play-check for Cannon Collapse. From the repo root:
//   node daily/2026-10-04-cannon-collapse/tools/play-check.mjs [--quick] [--levels=3,17]
// Starts its own static server, drives the game in headless Chromium, prints a per-level table, saves screenshots to screens/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const HERE = path.dirname(fileURLToPath(import.meta.url)), DIR = path.resolve(HERE, '..');
const PORT = 8000 + Math.floor(Math.random() * 900), URL = `http://127.0.0.1:${PORT}/index.html`;
const QUICK = process.argv.includes('--quick');
const ONLY = (process.argv.find(a => a.startsWith('--levels=')) || '').slice(9).split(',').filter(Boolean).map(n => +n - 1);
const N_SINGLE = QUICK ? 100 : 200, N_SEQ = QUICK ? 80 : 200;
const SCREENS = path.join(DIR, 'screens'); fs.mkdirSync(SCREENS, { recursive: true });
const shotFile = n => path.join(SCREENS, n);
const fails = []; let passes = 0;
const note = (ok, msg) => { if (ok) passes++; else fails.push(msg); console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHONES = [[360, 640], [390, 844], [412, 915]];
// solutions the level lab found, used only as a fall-back when this check's own random play finds no clear
let lab = {}; try { for (const c of JSON.parse(fs.readFileSync(path.join(HERE, 'lab-out.json'), 'utf8')).survivors) lab[c.id] = c.m; } catch (e) { /* no lab file: fine */ }

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
await sleep(700);
const browser = await chromium.launch();
const errors = [], foreign = [];
async function open(w, h, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, opts.ctx || {}));
  if (opts.storage !== undefined) await ctx.addInitScript(v => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('cannon-collapse-v1', v); sessionStorage.setItem('seeded', '1'); } }, opts.storage);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${w}x${h}] ` + m.text()); });
  page.on('pageerror', e => errors.push(`[${w}x${h}] ` + String(e)));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(`http://127.0.0.1:${PORT}/`) && !u.startsWith('data:')) foreign.push(u); });
  await page.goto(URL); await page.waitForFunction(() => window.__cc, null, { timeout: 8000 });
  return { ctx, page };
}
const noScroll = page => page.evaluate(() => { const e = document.scrollingElement; return e.scrollHeight <= innerHeight && e.scrollWidth <= innerWidth && scrollX === 0 && scrollY === 0; });
// does everything in the level sit inside the screen, under the top bar and clear of the bottom row?
const fit = page => page.evaluate(() => {
  const cc = window.__cc, bad = [];
  for (let i = 0; i < cc.levels; i++) {
    cc.goto(i); const s = cc.state(), v = s.view, L = window.LEVELS[i], p = L.platform;
    const topPx = (s.towerTop + v.oy) * v.scale, hudPx = v.hudB * v.scale, foot = (v.VH - (v.ground + v.oy)) * v.scale;
    const lo = Math.min(p.x - p.w / 2, ...L.blocks.map(b => p.x + b.x - b.w / 2)), hi = Math.max(p.x + p.w / 2, ...L.blocks.map(b => p.x + b.x + b.w / 2));
    if (topPx < hudPx + 4) bad.push(`level ${i + 1} top is under the top bar (${topPx.toFixed(0)} < ${hudPx.toFixed(0)})`);
    if (lo < v.XL + 2 || hi > v.XL + v.VW - 2) bad.push(`level ${i + 1} is cut off at the side`);
    if (foot < 80) bad.push(`level ${i + 1} leaves only ${foot.toFixed(0)} px under the ground`);
  }
  cc.goto(0); const s = cc.state(), v = s.view;
  return { bad, sky: ((s.towerTop + v.oy) * v.scale) / innerHeight, hud: v.hudB * v.scale, scale: v.scale };
});

try {
  const { ctx, page } = await open(390, 844);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const st = () => page.evaluate(() => window.__cc.state());
  const drag = async (file) => {
    await touch('touchStart', 250, 690);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', 250 - 8.5 * i, 690 + 6 * i); await sleep(16); }
    await sleep(120); const s = await st(); if (file) await page.screenshot({ path: shotFile(file) });
    return s;
  };

  // 1. load
  note((await page.title()) === 'Cannon Collapse', 'title is right');
  const meta = await page.evaluate(() => ({ n: window.__cc.levels, sets: window.__cc.sets, per: window.__cc.sets.map((_, k) => window.LEVELS.filter(l => l.set === k + 1).length),
    ids: new Set(window.LEVELS.map(l => l.id)).size, ordered: window.LEVELS.every((l, i, a) => !i || a[i - 1].set <= l.set), tips: window.LEVELS.filter(l => l.tip && l.tip.length > 40).length }));
  note(meta.n >= 36 && meta.sets.length === 4 && meta.per.every(n => n >= 8 && n <= 12), `${meta.n} levels in 4 sets (${meta.per.join(', ')})`);
  note(meta.ids === meta.n && meta.ordered && meta.tips === 0, 'level ids are all different, sets are in order, tips are one short line');
  let s = await st();
  note(/^level 1 of \d+$/.test(s.lvlText) && (await page.locator('#lvlSet').textContent()) === meta.sets[0] + ',' && /★ 0 \/ \d+/.test(await page.locator('#total').textContent()),
    `top bar shows "${await page.locator('#lvlSet').textContent()} ${s.lvlText}" and the star total "${await page.locator('#total').textContent()}"`);

  // 2. one real touch drag: aim, see the arc, let go
  s = await drag('1-set1-aiming.png');
  note(s.aiming && s.aim.power > 0.5 && s.aim.angle > 20 && s.aim.angle < 50, `touch drag aims (angle ${s.aim && s.aim.angle.toFixed(1)}, power ${s.aim && s.aim.power.toFixed(2)})`);
  await touch('touchEnd'); await sleep(250);
  s = await st(); note(s.used === 1, 'letting go fires one shot');
  note(await noScroll(page), 'page did not scroll during the drag (390x844)');

  // 3. set buttons: locked until the set before has enough stars
  const sb = page.locator('#sets .sb');
  note(await sb.count() === 4 && await page.locator('#sets .sb.locked').count() === 3, 'set row has 4 buttons, 3 locked on a fresh start');
  await sb.nth(1).tap(); await sleep(80); s = await st();
  note(s.set === 1 && /opens at \d+ stars/.test(s.hint), `tapping a locked set stays put and says why ("${s.hint}")`);
  await page.screenshot({ path: shotFile('7-set-buttons.png') });
  note(await page.locator('#next').isDisabled(), '"next" is off until the level is cleared');
  await page.evaluate(() => window.__cc.unlockAll());
  await sb.nth(2).tap(); await sleep(80); s = await st();
  note(s.set === 3 && s.lvlText.startsWith('level 1 of'), 'an open set button jumps to that set');

  // 4. every level stands by itself (3 s of game time, no drawing), plus four watched live for 3 s of real time
  const nLevels = meta.n, levels = ONLY.length ? ONLY : [...Array(nLevels).keys()];
  const stands = await page.evaluate(ls => ls.map(i => window.__cc.stand(i, 360)), levels);
  const badStand = levels.filter((i, k) => !stands[k].ok);
  note(badStand.length === 0, `all ${levels.length} levels stand still for 3 s untouched (worst drift ${Math.max(...stands.map(x => x.worst)).toFixed(2)} px)` + (badStand.length ? ': moving: ' + badStand.map(i => i + 1).join(', ') : ''));
  for (const i of levels.filter(i => i % 10 === 0)) {
    const a = await page.evaluate(i => { window.__cc.goto(i); return window.__cc.state(); }, i);
    await sleep(3000); const b = await st(); let worst = 0;
    b.blocks.concat(b.props).forEach((k, j) => { const o = a.blocks.concat(a.props)[j]; worst = Math.max(worst, Math.hypot(k.x - k.hx, k.y - k.hy), Math.hypot(k.x - o.x, k.y - o.y), Math.abs(k.a) * 40); });
    note(worst < 2 && b.remaining === b.total && b.phase === 'aim', `level ${i + 1} watched live stands still for 3 s (worst drift ${worst.toFixed(2)} px)`);
  }

  // 5. winnable, not a gift, near misses happen
  const table = []; let nearCase = null, winCase = null;
  for (const i of levels) {
    const r = await page.evaluate(({ i, N_SINGLE, N_SEQ }) => {
      let seed = 1234 + i * 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const L = window.LEVELS[i], types = [...new Set(L.shots)], total = L.blocks.filter(b => !b.pin && !b.rope).length;
      const shot = t => [5 + rnd() * 70, 0.25 + rnd() * 0.75, t];
      let single = 0;
      for (let k = 0; k < N_SINGLE; k++) { const o = window.__cc.run(i, [shot(types[Math.floor(rnd() * types.length)])]); if (o.phase === 'won') single++; }
      let wins = 0, near = 0, best = null, nearSeq = null;
      for (let k = 0; k < N_SEQ; k++) {
        const order = L.shots.slice().sort(() => rnd() - 0.5), seq = order.map(shot), o = window.__cc.run(i, seq);
        if (o.phase === 'won') { wins++; if (!best || o.used < best.used) best = { used: o.used, seq: seq.slice(0, o.used) }; }
        else if (o.phase === 'lost' && (o.remaining === 1 || o.remaining === 2)) { near++; if (o.remaining === 1 && !nearSeq) nearSeq = seq; }
      }
      return { id: L.id, set: L.set, name: L.name, shots: L.shots.join(''), blocks: total, single: single / N_SINGLE, winRate: wins / N_SEQ, nearRate: near / N_SEQ, best, nearSeq };
    }, { i, N_SINGLE, N_SEQ });
    let how = 'random play';
    if (!r.best && lab[r.id] && lab[r.id].bestSeq) {     // random play found nothing: replay the lab's solution
      const o = await page.evaluate(({ i, seq }) => window.__cc.run(i, seq), { i, seq: lab[r.id].bestSeq });
      if (o.phase === 'won') { r.best = { used: o.used, seq: lab[r.id].bestSeq }; how = "the lab's solution"; }
    }
    table.push({ level: i + 1, ...r });
    const firstOfSet = i % 10 === 0, lim = firstOfSet ? 0.25 : 0.12, slack = 0.05;
    note(!!r.best, `level ${i + 1} (${r.name}) can be cleared within its ${r.shots.length} shots` + (r.best ? ` (${r.best.used}-shot clear from ${how})` : ''));
    note(r.single <= lim + slack, `level ${i + 1} is not a gift: a random first shot clears it ${(r.single * 100).toFixed(1)}% of the time (limit ${lim * 100}%, +${slack * 100} for sampling)`);
    if (r.nearSeq && !nearCase) nearCase = { i, seq: r.nearSeq };
    if (r.best && r.blocks >= 5 && !winCase) winCase = { i, seq: r.best.seq };
  }
  const noNear = table.filter(t => t.nearRate === 0).map(t => t.level);
  note(noNear.length === 0, 'every level ends 1 or 2 blocks short in some random attempts' + (noNear.length ? ' (never: ' + noNear.join(', ') + ')' : ''));
  for (let k = 0; k < 4; k++) {   // difficulty rises: compare the easy half and the hard half of each set (levels 2 to 10)
    const t = table.filter(x => x.set === k + 1 && (x.level - 1) % 10 !== 0), h = Math.floor(t.length / 2); if (t.length < 6) continue;
    const avg = a => a.reduce((x, y) => x + y.winRate, 0) / a.length, a = avg(t.slice(0, h)), b = avg(t.slice(-h));
    note(a >= b, `${meta.sets[k]}: random attempts win more often in the first half (${(a * 100).toFixed(1)}%) than in the second (${(b * 100).toFixed(1)}%)`);
  }
  console.log('\nlevel | set | name               | shots | blocks | best | 1st random shot clears | random attempts win | end 1-2 left');
  for (const t of table) console.log(`${String(t.level).padStart(5)} | ${String(t.set).padStart(3)} | ${t.name.padEnd(18)} | ${t.shots.padEnd(5)} | ${String(t.blocks).padStart(6)} | ${String(t.best ? t.best.used : '-').padStart(4)} | ${(t.single * 100).toFixed(1).padStart(21)}% | ${(t.winRate * 100).toFixed(1).padStart(18)}% | ${(t.nearRate * 100).toFixed(1).padStart(10)}%`);
  console.log('');
  fs.writeFileSync(shotFile('table.json'), JSON.stringify(table.map(({ best, nearSeq, ...t }) => ({ ...t, best: best && best.used })), null, 1));

  // 6. near miss, played live
  if (!nearCase) note(false, 'found a run that ends with 1 block left');
  else {
    await page.evaluate(({ i, seq }) => { window.__cc.goto(i); window.__cc.queue(seq); }, nearCase);
    await page.waitForFunction(() => window.__cc.state().phase !== 'aim', null, { timeout: 90000 });
    await sleep(200); s = await st();
    note(s.phase === 'lost' && s.remaining === 1 && s.overlay && /^So close\. 1 block left\.$/.test(s.overlayText), `near miss shows "${s.overlayText}" (level ${nearCase.i + 1})`);
    const again = page.locator('#again'); note(await again.isVisible(), '"Again" button is showing');
    await page.screenshot({ path: shotFile('8-near-miss.png') });
    await page.evaluate(() => { const b = document.getElementById('again'); window.__tap = null;
      b.addEventListener('pointerdown', () => { window.__tap = { down: performance.now() }; }, { capture: true, once: true });
      const tick = () => { const q = window.__cc.state(); if (window.__tap && !window.__tap.done && q.phase === 'aim' && q.used === 0 && q.remaining === q.total && !q.overlay) { window.__tap.done = performance.now(); return; } requestAnimationFrame(tick); }; tick(); });
    const box = await again.boundingBox(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__tap && window.__tap.done, null, { timeout: 5000 });
    const ms = await page.evaluate(() => window.__tap.done - window.__tap.down);
    note(ms < 300, `"Again" resets the level in ${ms.toFixed(0)} ms (limit 300), straight back to aiming`);
  }

  // 7. a real clear, live: stars are saved, "Next" shows, the total goes up
  if (winCase) {
    await page.evaluate(() => { localStorage.removeItem('cannon-collapse-v1'); });
    const before = (await st()).total_stars;
    await page.evaluate(({ i, seq }) => { window.__cc.goto(i); window.__cc.queue(seq); }, winCase);
    await page.waitForFunction(() => window.__cc.state().overlay, null, { timeout: 90000 });
    await sleep(250); s = await st();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cannon-collapse-v1') || '{}'));
    note(s.phase === 'won' && s.stars >= 1 && await page.locator('#nextBtn').isVisible(), `live replay clears level ${winCase.i + 1}: ${s.stars} star(s), "Next" showing`);
    note(saved.stars && saved.stars[s.id] === s.stars && s.total_stars >= before, 'stars are saved under the level id and counted in the total');
    await page.screenshot({ path: shotFile('9-cleared.png') });
  }

  // 8. screenshots: one level of each other set while aiming, a seesaw mid-tip, a rope mid-swing
  const pickLevel = f => page.evaluate(f => window.LEVELS.map((l, i) => (l.blocks.some(b => b[f]) ? i : -1)).filter(i => i >= 0), f);
  const firstOf = k => page.evaluate(k => window.LEVELS.findIndex(l => l.set === k), k);
  for (const [k, lv, file] of [[2, (await firstOf(2)) + 4, '2-set2-aiming.png'], [3, (await firstOf(3)) + 5, '3-set3-aiming.png'], [4, (await firstOf(4)) + 3, '4-set4-aiming.png']]) {
    await page.evaluate(i => window.__cc.goto(i), lv); await sleep(150); s = await drag(file); await touch('touchEnd'); await sleep(60);
    note(s.aiming && s.set === k, `aiming works on a set ${k} level (level ${lv + 1})`);
  }
  for (const [f, file, what, moved] of [['pin', '5-seesaw-mid-tip.png', 'a seesaw plank tips', 'p.prop === "pin" && Math.abs(p.a) > 0.12'], ['rope', '6-rope-swing.png', 'a hanging weight swings', 'p.prop === "rope" && Math.hypot(p.x - p.hx, p.y - p.hy) > 16']]) {
    let ok = false;
    for (const i of await pickLevel(f)) {
      const seqs = [table[i] && lab[table[i].id] && lab[table[i].id].bestSeq, [[20, 0.7], [30, 0.8], [12, 0.9]], [[35, 0.6], [25, 1], [15, 0.7]]].filter(Boolean);
      for (const seq of seqs) {
        await page.evaluate(({ i, seq }) => { window.__cc.goto(i); window.__cc.queue(seq); }, { i, seq });
        try { await page.waitForFunction(new Function('return window.__cc.state().props.some(p => ' + moved + ')'), null, { timeout: 12000, polling: 'raf' }); ok = true; } catch (e) { /* try the next */ }
        if (ok) { await page.screenshot({ path: shotFile(file) }); note(true, `${what} when hit (level ${i + 1})`); break; }
      }
      if (ok) break;
    }
    if (!ok) note(false, what + ' when hit');
  }
  await ctx.close();

  // 9. the three phone sizes: no scroll, nothing cut off or under the top bar, level 1 screenshot
  for (const [w, h] of PHONES) {
    const o = await open(w, h); await o.page.evaluate(() => window.__cc.unlockAll());
    const f = await fit(o.page); await o.page.evaluate(() => window.__cc.lockAgain()); await sleep(150);
    note(await noScroll(o.page), `no page scroll at ${w}x${h}`);
    note(f.bad.length === 0, `every level fits the screen at ${w}x${h}` + (f.bad.length ? ': ' + f.bad.slice(0, 4).join('; ') : ''));
    note(f.sky < 0.36, `level 1 at ${w}x${h}: the tower top is ${(f.sky * 100).toFixed(0)}% of the way down the screen (was about 42% on a tall phone)`);
    await o.page.screenshot({ path: shotFile(`10-level1-${w}x${h}.png`) });
    if (w === 360) {   // out of shots on the small phone
      await o.page.evaluate(() => { window.__cc.goto(0); window.__cc.queue(window.LEVELS[0].shots.map(() => [10, 0.2])); });
      await o.page.waitForFunction(() => window.__cc.state().overlay, null, { timeout: 60000 }); await sleep(200);
      await o.page.screenshot({ path: shotFile('11-small-phone-out-of-shots.png') });
    }
    await o.ctx.close();
  }

  // 10. saved progress from the 10-level version, and damaged saves, must not break the game
  const olds = [['the 10-level version', JSON.stringify({ stars: [3, 2, 1, 3, 2, 1, 1, 2, 3, 1], furthest: 9, muted: false }), true], ['a half-played old game', JSON.stringify({ stars: [3, null, 2], furthest: 3, muted: true }), true],
    ['cut-off text', '{"stars":[3,2', false], ['the wrong shapes', JSON.stringify({ stars: { nope: 9, x: 'y' }, at: 'gone', muted: 3 }), false], ['a bare number', '7', false], ['stars as text', JSON.stringify({ stars: 'lots', furthest: 'far' }), false]];
  for (const [what, value, expectStars] of olds) {
    let ok = false, info = '';
    try {
      const o = await open(390, 844, { storage: value }); const q = await o.page.evaluate(() => window.__cc.state());
      ok = q.phase === 'aim' && q.total > 0 && (expectStars ? q.total_stars > 0 : q.total_stars === 0); info = `${q.total_stars} stars carried over, starts on level ${q.level + 1}`;
      await o.page.evaluate(() => window.__cc.fire(30, 0.7)); await sleep(150); ok = ok && (await o.page.evaluate(() => window.__cc.state().used)) === 1;
      await o.ctx.close();
    } catch (e) { info = String(e).slice(0, 120); }
    note(ok, `a save from ${what} loads and plays (${info})`);
  }

  // 11. desktop: fits, mouse drag fires
  const d = await open(1280, 800, { ctx: { hasTouch: false, isMobile: false, deviceScaleFactor: 1 } });
  const bx = await d.page.locator('#c').boundingBox();
  await d.page.mouse.move(bx.x + bx.width * 0.6, 560); await d.page.mouse.down(); await d.page.mouse.move(bx.x + bx.width * 0.6 - 80, 620, { steps: 8 });
  await sleep(100); await d.page.screenshot({ path: shotFile('12-desktop-aiming.png') }); await d.page.mouse.up(); await sleep(200);
  note((await d.page.evaluate(() => window.__cc.state().used)) === 1, 'mouse drag on desktop fires a shot');
  await d.page.evaluate(() => window.__cc.unlockAll()); const fd = await fit(d.page);
  note(fd.bad.length === 0 && await noScroll(d.page), 'every level fits on desktop (1280x800), no scroll' + (fd.bad.length ? ': ' + fd.bad.slice(0, 3).join('; ') : ''));
  await d.ctx.close();

  note(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  note(foreign.length === 0, 'no requests to other hosts' + (foreign.length ? ': ' + foreign.slice(0, 3).join(', ') : ''));
} finally {
  await browser.close(); server.kill();
}
console.log(fails.length ? `\nPLAY-CHECK FAILED (${fails.length} of ${passes + fails.length}):\n - ` + fails.join('\n - ') : `\nPLAY-CHECK PASSED (${passes} checks, ${ONLY.length || 'all'} levels)`);
process.exit(fails.length ? 1 : 0);
