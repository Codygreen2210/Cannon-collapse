// Pictures of exact moments, for judging the looks by eye. Start `python3 -m http.server 8765`, then:
//   node tools/shots.mjs http://localhost:8765
// Uses the test hook's freeze() and advance() so every run stops on the same frames. Writes to screens/ (ignored by git).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { BIG } from './big-tower.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.resolve(HERE, '..', 'screens'); fs.mkdirSync(OUT, { recursive: true });
const base = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:8765').replace(/\/$/, '');
let lab = {}; try { for (const c of JSON.parse(fs.readFileSync(path.join(HERE, 'lab-out.json'), 'utf8')).survivors) lab[c.id] = c.m.bestSeq; } catch (e) { /* fine */ }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGE ERROR', String(e)));
await page.goto(base + '/index.html'); await page.waitForFunction(() => window.__cc);
await page.evaluate(() => window.__cc.unlockAll());
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const snap = async (name, clip) => { await page.screenshot({ path: path.join(OUT, name) }); if (clip) await page.screenshot({ path: path.join(OUT, name.replace('.png', '-close.png')), clip }); console.log('wrote ' + name); };
const ids = await page.evaluate(() => window.LEVELS.map(l => ({ id: l.id, mats: l.blocks.map(b => b.m), n: l.blocks.length })));
const find = f => ids.findIndex(f);
// go to a level frozen, fire, then step frame by frame until `until` (source of a function of state) is true, plus `extra` frames
async function moment(level, shots, until, extra, max = 600) {
  if (Array.isArray(shots[0][0])) { let r; for (const sh of shots) { r = await moment(level, [sh[0]], until, extra, max); if (r.ok) break; } return r; }   // a list of things to try
  return page.evaluate(({ level, shots, until, extra, max }) => {
    const cc = window.__cc, test = new Function('s', 'p', 'return ' + until);
    cc.goto(level); cc.freeze(true); cc.advance(2); cc.queue(shots);
    let n = 0; while (n++ < max && !test(cc.state(), cc.perf())) cc.advance(1);
    cc.advance(extra); const p = cc.perf(); return { frames: n, ok: n <= max, particles: p.particles, peak: p.peak, slows: p.slows };
  }, { level, shots, until, extra, max });
}
const CAN = { x: 0, y: 400, width: 220, height: 220 }, TOWER = { x: 150, y: 150, width: 240, height: 400 };

// 1. aiming, barrel pulled back (a real touch drag)
await page.evaluate(() => window.__cc.goto(0));
await touch('touchStart', 250, 690); for (let i = 1; i <= 10; i++) { await touch('touchMove', 250 - 9.5 * i, 690 + 6.5 * i); await new Promise(r => setTimeout(r, 16)); }
await new Promise(r => setTimeout(r, 120)); await snap('p1-aiming.png', CAN); await touch('touchEnd');
// 2. the first frame of the muzzle flash, 3. ball in flight with its trail
console.log(await moment(0, [[38, 0.95]], 's.used === 1', 0)); await snap('p2-muzzle-flash.png', CAN);
await page.evaluate(() => window.__cc.advance(4)); await snap('p2b-smoke.png', CAN);
await page.evaluate(() => window.__cc.advance(10)); await snap('p3-ball-trail.png');
await moment(find(l => l.mats.includes('wood')) + 8, [[38, 0.95, 'h']], 's.used === 1', 14); await snap('p3b-heavy-ball-trail.png');
// 4. wood: crack mark and splinters
console.log(await moment(0, lab[ids[0].id], 's.blocks.some(b => b.m === "wood" && b.marks > 0)', 3)); await snap('p4-wood-hit.png', TOWER);
// 5. glass shattering, and a glass block that was hit but held
const gl = find(l => l.mats.includes('glass'));
console.log(await moment(gl, lab[ids[gl].id] || [[30, 0.9]], 's.blocks.some(b => b.m === "glass" && b.gone)', 4)); await snap('p5-glass-shatter.png', TOWER);
console.log(await moment(gl, [[[30, 0.42]], [[34, 0.5]], [[40, 0.5]], [[36, 0.45]], [[44, 0.55]], [[28, 0.5]], [[48, 0.6]]], 's.blocks.some(b => b.m === "glass" && b.marks > 0)', 2)); await snap('p5b-glass-crack-star.png', TOWER);
// 6. ice with fracture lines
const ic = find(l => l.mats.includes('ice') && l.n >= 4);
console.log(await moment(ic, lab[ids[ic].id] || [[30, 0.9]], 's.blocks.some(b => b.m === "ice" && b.marks > 0)', 3)); await snap('p6-ice-fracture.png', TOWER);
// 7. TNT going off
const tn = find(l => l.mats.includes('tnt') && l.n >= 7);
console.log(await moment(tn, lab[ids[tn].id] || [[30, 0.9]], 's.blocks.some(b => b.m === "tnt" && b.gone)', 2)); await snap('p7-tnt.png', TOWER);
await page.evaluate(() => window.__cc.advance(8)); await snap('p7b-tnt-later.png');
// 8. a big collapse with dust: the 14-block test tower, at rest, as the TNT goes, and as the pieces land
await page.evaluate(L => { window.__cc.freeze(true); window.__cc.goto(L); window.__cc.advance(2); }, BIG); await snap('p8-tower-at-rest.png');
console.log(await moment(BIG, [[58, 1, 'h']], 's.blocks.some(b => b.m === "tnt" && b.gone)', 3)); await snap('p8a-collapse-start.png');
for (const [n, f] of [['p8b-collapse.png', 30], ['p8c-collapse-landing.png', 40], ['p8d-collapse-dust.png', 30]]) { console.log(await page.evaluate(f => { window.__cc.advance(f); const p = window.__cc.perf(); return { particles: p.particles, peak: p.peak }; }, f)); await snap(n); }
// every material side by side, at rest
for (const [name, f] of [['p9-tnt-glass-level.png', l => l.mats.includes('tnt') && l.mats.includes('glass')], ['p9-ice-level.png', l => l.mats.includes('ice') && l.n >= 6], ['p9-stone-level.png', l => l.mats.includes('stone') && l.mats.includes('wood')], ['p9-balance-level.png', l => l.id.startsWith('s4') ]]) { const i = find(f); if (i >= 0) { await page.evaluate(i => { window.__cc.freeze(false); window.__cc.goto(i); }, i); await new Promise(r => setTimeout(r, 200)); await snap(name); } }
await browser.close();
