// Physics fingerprint and lab re-measure. Looks and sound work must not move these numbers.
//   node tools/physics-check.mjs http://localhost:8765 [--save]   (start `python3 -m http.server 8765` first)
// 1. Plays 5 fixed attempts on every level with the headless hook and compares the outcomes with tools/physics-baseline.json
//    (--save writes that file; only do it when a physics change is meant).
// 2. Re-runs the level lab's own measure() on two levels and compares with tools/lab-out.json.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv.find(a => a.startsWith('http')) || 'http://localhost:8765').replace(/\/$/, '');
const SAVE = process.argv.includes('--save'), FILE = path.join(HERE, 'physics-baseline.json');
const browser = await chromium.launch(), page = await browser.newPage();
await page.goto(base + '/index.html'); await page.waitForFunction(() => window.__cc);
const now = await page.evaluate(() => {
  const SH = [[30, 0.7], [18, 0.95], [45, 0.6], [10, 1], [60, 0.85]], out = [];
  for (let i = 0; i < window.__cc.levels; i++) {
    const L = window.LEVELS[i];
    out.push(SH.map((s, k) => { const seq = L.shots.map((t, j) => [s[0] + j * 4, Math.max(0.3, s[1] - j * 0.07), t]); const o = window.__cc.run(i, seq); return [o.phase, o.remaining, o.used, o.ticks].join(':'); }).join(' '));
  }
  return out;
});
let bad = 0;
if (SAVE) { fs.writeFileSync(FILE, JSON.stringify(now, null, 0) + '\n'); console.log('baseline saved: ' + now.length + ' levels'); }
else {
  const was = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  now.forEach((r, i) => { if (r !== was[i]) { bad++; console.log(`level ${i + 1} moved:\n  was ${was[i]}\n  now ${r}`); } });
  console.log(`fingerprint: ${now.length - bad} of ${now.length} levels identical (5 fixed attempts each: outcome, blocks left, shots used, physics ticks)`);
}
// the lab's measure(), taken from its source so the two cannot drift apart
const src = fs.readFileSync(path.join(HERE, 'level-lab.mjs'), 'utf8'), a = src.indexOf('function measure('), b = src.indexOf('\n}\n', a);
const measure = new Function('arg', src.slice(a, b + 2) + '\nreturn measure(arg);');
const lab = JSON.parse(fs.readFileSync(path.join(HERE, 'lab-out.json'), 'utf8')).survivors;
const kept = await page.evaluate(() => window.LEVELS.map(l => l.id)), names = await page.evaluate(() => window.LEVELS.map(l => l.name));
const pct = x => (x * 100).toFixed(1) + '%';
for (const id of [kept[3], kept[12]]) {
  const c = lab.find(x => x.id === id); if (!c) { console.log('not in lab-out.json: ' + id); bad++; continue; }
  const { m, ...L } = c, r = await page.evaluate(measure, { L, lim: L.intro ? 0.25 : 0.12, seed: 4242 });
  const same = r.best === m.best && r.single === m.single && r.win === m.win && r.near === m.near && Math.abs(r.drift - m.drift) < 1e-9;
  if (!same) bad++;
  console.log(`${same ? 'SAME ' : 'MOVED'} ${names[kept.indexOf(id)]} (${id}): best ${r.best} (lab ${m.best}), 1st shot clears ${pct(r.single)} (${pct(m.single)}), random attempts win ${pct(r.win)} (${pct(m.win)}), end 1-2 left ${pct(r.near)} (${pct(m.near)}), drift ${r.drift.toFixed(2)} (${m.drift.toFixed(2)})`);
}
await browser.close();
console.log(bad ? `PHYSICS-CHECK FAILED (${bad})` : 'PHYSICS-CHECK PASSED');
process.exit(bad ? 1 : 0);
