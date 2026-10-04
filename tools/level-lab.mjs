// Level lab for Cannon Collapse: makes levels by machine and keeps the good ones. From the repo root:
//   node daily/2026-10-04-cannon-collapse/tools/level-lab.mjs [--n=90] [--seed=7] [--pick]
// For each of the four sets it builds candidate layouts from templates, runs every one headless in Chromium
// through the game's own physics (window.__cc), and measures:
//   stands still for 3 s untouched, the fewest shots a search needs to clear it, how often one random shot clears it,
//   how often a random full attempt wins, and how often one ends with exactly 1 or 2 blocks left (the near miss rate).
// It throws out the unstable, unwinnable, trivial and the ones with no near misses, picks ten per set that differ,
// orders them easiest first, then writes ../levels.js and level-table.md. Every survivor is kept in lab-out.json;
// --pick redoes only the choosing from that file (no simulation).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const HERE = path.dirname(fileURLToPath(import.meta.url)), DIR = path.resolve(HERE, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const N = +arg('n', 90), SEED = +arg('seed', 7), PICK = process.argv.includes('--pick');
const ONLY = arg('only', '').split(',').filter(Boolean);   // --only=tplA,tplB measures just those templates again and merges them into lab-out.json
const OUT = path.join(HERE, 'lab-out.json');
const SETS = ['Timber', 'Glass and powder', 'Ice', 'Balance'];
const LIMIT = { single: 0.12, singleIntro: 0.25, nearMin: 0.05, nearGood: 0.15, maxHeight: 225, rightEdge: 338, leftEdge: 182 };

// ---------- candidate templates ----------
function rng(seed) { let s = seed >>> 0; const f = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  f.i = (a, b) => a + Math.floor(f() * (b - a + 1)); f.pick = a => a[Math.floor(f() * a.length)]; f.p = q => f() < q; return f; }
const B = (m, x, y, w, h, more) => Object.assign({ m, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, more || {});
const ws = r => (r.p(0.3) ? 'stone' : 'wood');
function column(r, x, y, n, w, hLo, hHi, mat) { const out = []; for (let k = 0; k < n; k++) { const h = r.i(hLo, hHi); out.push(B(mat(k), x, y, w - (k ? r.i(0, 4) : 0), h)); y += h; } return out; }
const top = bs => Math.max(...bs.map(b => b.y + b.h));

const T = {
  // --- set 1: wood and stone ---
  stack: r => { const w = r.i(32, 44); return { names: ['Stack', 'Crates', 'Pile'], w: w + r.i(24, 40), blocks: column(r, 0, 0, r.i(3, 5), w, 28, 42, () => ws(r)) }; },
  tall: r => { const w = r.i(24, 30); return { names: ['Tall and thin', 'Chimney', 'Mast'], w: r.i(56, 70), blocks: column(r, 0, 0, r.i(5, 6), w, 30, 36, k => (k === 0 && r.p(0.4) ? 'stone' : 'wood')) }; },
  widebase: r => { const pw = r.i(90, 112), bl = [B('wood', 0, 0, pw, 14)].concat(column(r, 0, 14, r.i(2, 4), r.i(28, 32), 34, 42, () => ws(r)));
    if (r.p(0.6)) bl.push(B(ws(r), r.pick([-1, 1]) * (pw / 2 - 14), 14, 24, 24)); return { names: ['Wide base', 'Tray', 'Overhang'], w: r.i(54, 66), blocks: bl }; },
  table: r => { const g = r.i(20, 30), lw = r.i(14, 18), lh = r.i(40, 60), th = r.i(18, 28), bl = [B('wood', -g, 0, lw, lh), B('wood', g, 0, lw, lh), B(r.p(0.7) ? 'stone' : 'wood', 0, lh, 2 * g + r.i(24, 34), th)];
    if (r.p(0.6)) bl.push(B('wood', 0, lh + th, r.i(26, 32), r.i(26, 32))); if (2 * g - lw >= 28 && r.p(0.5)) bl.push(B(ws(r), 0, 0, 24, r.i(20, lh - 8)));
    return { names: ['Stone on legs', 'Table', 'Workbench'], w: 2 * g + r.i(34, 50), blocks: bl }; },
  bridge: r => { const d = r.i(38, 46), lw = r.i(16, 20), lh = r.i(50, 64), bl = [B('wood', -d, 0, lw, lh), B('wood', d, 0, lw, lh), B('wood', 0, lh, 2 * d + r.i(26, 34), 12), B(ws(r), r.i(-12, 12), lh + 12, 30, 30)];
    if (r.p(0.7)) bl.push(B(ws(r), 0, 0, r.i(26, 32), r.i(24, 34))); return { names: ['Bridge', 'Footbridge', 'Span'], w: 2 * d + r.i(18, 26), blocks: bl, heavyOk: true }; },
  fort: r => { const d = r.i(42, 52), wh = r.i(44, 54), ww = r.i(24, 30), bl = [B(ws(r), -d, 0, ww, wh), B('stone', d, 0, ww, wh), B('wood', 0, wh, 2 * d + ww + 4, 12), B(ws(r), r.i(-20, 20), wh + 12, 30, 30)];
    if (r.p(0.6)) bl.push(B('wood', 0, 0, 30, r.i(24, 36))); if (r.p(0.5)) bl.push(B('wood', bl[3].x, wh + 42, 26, 26));
    return { names: ['The fort', 'Gatehouse', 'Bunker'], w: 2 * d + ww + r.i(8, 18), blocks: bl, heavyOk: true }; },
  twin: r => { const d = r.i(36, 44), w = r.i(26, 32), h = r.i(40, 50), bl = [B('wood', -d, 0, w, h), B('wood', -d, h, w, h), B(ws(r), d, 0, w, h), B(ws(r), d, h, w, h)];
    if (r.p(0.65)) { bl.push(B('wood', 0, 2 * h, 2 * d + w + 6, 12)); bl.push(B(ws(r), 0, 2 * h + 12, 28, 28)); }
    return { names: ['Two towers', 'Gateposts', 'Goalposts'], w: 2 * d + w + r.i(4, 16), blocks: bl, heavyOk: true }; },
  pyramid: r => { const w = r.i(28, 34), m = () => ws(r); return { names: ['Pyramid', 'Heap', 'Six pack'], w: 3 * w + r.i(6, 24),
    blocks: [B(m(), -w, 0, w, w), B(m(), 0, 0, w, w), B(m(), w, 0, w, w), B('wood', -w / 2, w, w, w), B('wood', w / 2, w, w, w), B('wood', 0, 2 * w, w, w)], heavyOk: true }; },
  steps: r => { const w = r.i(28, 34), h = r.i(26, 32), bl = []; [1, 2, 3].forEach((n, c) => { for (let k = 0; k < n; k++) bl.push(B(k === 0 && r.p(0.35) ? 'stone' : 'wood', (c - 1) * w, k * h, w, h)); });
    if (r.p(0.5)) bl.forEach(b => { b.x = -b.x; }); return { names: ['Steps', 'Stairs', 'Staircase'], w: 3 * w + r.i(6, 20), blocks: bl, heavyOk: true }; },
  // --- set 2: glass and TNT ---
  glassIntro: r => { const w = r.i(30, 40), n = r.i(2, 3), bl = column(r, 0, 0, n, w, 34, 42, () => 'glass'); bl.push(B('wood', 0, top(bl), w - 2, r.i(30, 36)));
    return { names: ['Glass'], w: w + r.i(30, 44), blocks: bl, intro: true, tip: 'Glass breaks on a hard hit.' }; },
  glasswall: r => { const w = r.i(32, 38), bl = [B('glass', -(w / 2 + r.i(20, 30)), 0, 12, r.i(70, 100))].concat(column(r, 8, 0, 3, w, 30, 38, k => (k === 1 ? 'stone' : 'wood')));
    return { names: ['Glass in the way', 'Window', 'Shop front'], w: w + r.i(66, 80), blocks: bl, heavyOk: true }; },
  glasslegs: r => { const g = r.i(24, 32), lh = r.i(44, 56), bl = [B('glass', -g, 0, 14, lh), B('glass', g, 0, 14, lh), B('stone', 0, lh, 2 * g + 28, 22)];
    const tnt = r.p(0.5); bl.push(B(tnt ? 'tnt' : 'wood', 0, lh + 22, 26, 26)); if (r.p(0.7)) bl.push(B('wood', 0, lh + 48, 30, 30)); if (r.p(0.4)) bl.push(B('stone', 0, 0, 24, r.i(20, 32)));
    return { names: ['Glass legs', 'Glass table', 'Stilts'], w: 2 * g + r.i(48, 64), blocks: bl, heavyOk: true }; },
  glasstower: r => { const w = r.i(30, 38), seq = r.pick([['stone', 'glass', 'wood', 'glass', 'wood'], ['glass', 'stone', 'glass', 'wood'], ['wood', 'glass', 'stone', 'glass', 'stone']]);
    return { names: ['Layer cake', 'Sandwich', 'Lantern'], w: w + r.i(26, 44), blocks: column(r, 0, 0, seq.length, w, 28, 38, k => seq[k]), heavyOk: true }; },
  // TNT on the cannon side with wood beside it; a stone lump on the far side is out of the blast and needs its own shot
  tntside: r => { const sw = r.i(28, 34), sx = r.i(44, 56), bl = [B('tnt', -sx, 0, 28, 28), B('wood', -sx + 31, 0, 30, r.i(30, 40))];
    bl.push(B('wood', -sx + 31, bl[1].h, 28, r.i(26, 34))); if (r.p(0.5)) bl.push(B('wood', -sx, 28, 26, 26));
    bl.push(B('stone', sx, 0, sw, r.i(36, 48))); if (r.p(0.7)) bl.push(B(r.p(0.5) ? 'glass' : 'wood', sx, bl[bl.length - 1].h, sw - 4, r.i(26, 40)));
    return { names: ['Powder keg', 'Short fuse', 'Far corner'], w: 2 * sx + sw + r.i(4, 14), blocks: bl, heavyOk: true }; },
  tntunder: r => { const g = r.i(24, 28), lh = r.i(40, 50), cx = -r.i(22, 30), sx = r.i(48, 58), sw = r.i(28, 32);
    const bl = [B('wood', cx - g, 0, 14, lh), B('wood', cx + g, 0, 14, lh), B('wood', cx, lh, 2 * g + 24, 12), B(ws(r), cx, lh + 12, 28, 28), B('tnt', cx, 0, 26, 26), B('stone', sx, 0, sw, r.i(40, 54))];
    if (r.p(0.5)) bl.push(B('wood', sx, bl[5].h, sw - 2, 28)); return { names: ['Under the table', 'Cellar', 'Trapdoor'], w: 2 * sx + sw + r.i(2, 10), blocks: bl, heavyOk: true }; },
  tnttop: r => { const w = r.i(44, 58), bl = [B('stone', 0, 0, w, r.i(28, 36))]; const h0 = bl[0].h; bl.push(B('wood', -w / 4 - 1, h0, w / 2 - 2, r.i(28, 36)), B('wood', w / 4 + 1, h0, w / 2 - 2, bl[1] ? 30 : 30));
    bl[2].h = bl[1].h; bl.push(B('tnt', 0, h0 + bl[1].h, 28, 28)); if (r.p(0.6)) bl.push(B('wood', 0, h0 + bl[1].h + 28, 30, 26));
    return { names: ['Top shelf', 'Hat', 'Plinth'], w: w + r.i(20, 40), blocks: bl, heavyOk: true }; },
  tntfort: r => { const d = r.i(46, 52), wh = r.i(46, 52), bl = [B('glass', -d, 0, 14, wh), B('tnt', -d + r.i(26, 34), 0, 28, r.i(36, 44)), B('stone', d, 0, 28, wh), B('wood', 0, wh, 2 * d + 28, 12),
      B(ws(r), r.i(0, 10), wh + 12, 30, 30), B('stone', d - 6, wh + 12, 28, 28)]; if (r.p(0.5)) bl.push(B('wood', bl[4].x, wh + 42, 28, 28));
    return { names: ['Glass gate', 'Magazine', 'Strongroom'], w: 2 * d + r.i(36, 46), blocks: bl, heavyOk: true }; },
  glasstwin: r => { const d = r.i(40, 46), h = r.i(42, 50), bl = [B('wood', -d, 0, 28, h), B(r.p(0.5) ? 'glass' : 'wood', -d, h, 28, h), B('stone', d, 0, 32, h - 4), B('glass', d, h - 4, 28, h + 4), B('wood', 0, 2 * h, 2 * d + 36, 12), B(ws(r), 0, 2 * h + 12, 28, 28)];
    if (r.p(0.5)) bl.push(B('tnt', 0, 0, 26, 26)); return { names: ['Glass towers', 'Crossbar', 'High wire'], w: 2 * d + r.i(28, 38), blocks: bl, heavyOk: true }; },
  // --- set 3: ice ---
  iceIntro: r => { const w = r.i(34, 42), v = r.i(0, 2), bl = [];
    if (v === 0) bl.push(B('ice', -w / 2 - 1, 0, w, r.i(32, 40)), B('ice', w / 2 + 1, 0, w, r.i(32, 40)));
    else { bl.push(...column(r, 0, 0, r.i(2, 3), w, 30, 38, () => 'ice')); if (v === 2) bl.push(B('ice', w + 2, 0, w - 4, r.i(30, 38))); }
    return { names: ['Ice'], w: (v === 1 ? w : 2 * w) + r.i(22, 40), blocks: bl, intro: true, tip: 'Ice slides. A nudge goes a long way.' }; },
  icestack: r => { const w = r.i(34, 42), n = r.i(3, 4), bl = column(r, 0, 0, n, w, 30, 38, () => 'ice'); if (r.p(0.6)) bl.push(B(ws(r), 0, top(bl), w - 4, 30));
    return { names: ['Ice cubes', 'Cold stack', 'Frozen crates'], w: w + r.i(24, 44), blocks: bl }; },
  icerow: r => { const w = r.i(28, 34), n = r.i(3, 4), bl = []; for (let k = 0; k < n; k++) bl.push(B(r.pick(['ice', 'ice', 'wood', 'stone']), (k - (n - 1) / 2) * w, 0, w - 3, r.i(30, 40)));
    if (r.p(0.7)) { const k = r.i(0, n - 2); bl.push(B(ws(r), (bl[k].x + bl[k + 1].x) / 2, Math.max(bl[k].h, bl[k + 1].h), w, 28)); bl[k].h = bl[k + 1].h = Math.max(bl[k].h, bl[k + 1].h); }
    return { names: ['Rink', 'Curling', 'Slide'], w: n * w + r.i(24, 50), ice: true, blocks: bl, heavyOk: true }; },
  icebase: r => { const sw = r.i(70, 92), bl = [B('ice', 0, 0, sw, 20)], two = r.p(0.5);
    if (two) { bl.push(...column(r, -sw / 4, 20, 2, 28, 30, 38, () => ws(r)), ...column(r, sw / 4, 20, 2, 28, 30, 38, () => ws(r))); } else bl.push(...column(r, 0, 20, r.i(2, 3), r.i(30, 36), 30, 40, () => ws(r)));
    return { names: ['Sled', 'Ice floe', 'Raft'], w: sw + r.i(20, 44), blocks: bl, heavyOk: true }; },
  icetable: r => { const g = r.i(22, 30), lh = r.i(40, 54), bl = [B('ice', -g, 0, r.i(16, 20), lh), B('ice', g, 0, r.i(16, 20), lh), B('stone', 0, lh, 2 * g + 28, 22), B(ws(r), 0, lh + 22, 28, 28)];
    if (r.p(0.4)) bl.push(B('wood', 0, 0, 22, r.i(20, 30))); return { names: ['Ice legs', 'Cold table', 'Icicles'], w: 2 * g + r.i(44, 64), blocks: bl, heavyOk: true }; },
  // one half of the platform is ice: the wooden tower on it slides away, the stone on the rough half does not
  halfice: r => { const pw = r.i(124, 148), right = r.p(0.5), s = right ? 1 : -1, tx = s * pw / 4, bx = -s * pw / 4, w = r.i(28, 34);
    const bl = column(r, tx, 0, r.i(2, 3), w, 30, 38, () => r.pick(['wood', 'wood', 'ice'])).concat(column(r, bx, 0, r.i(1, 2), r.i(28, 34), 30, 40, k => (k ? 'wood' : 'stone')));
    if (r.p(0.5)) bl.push(B('wood', tx + s * -(w + 0), 0, w, r.i(26, 34)));
    return { names: ['Half and half', 'Thin ice', 'Thaw line'], w: pw, ice: right ? [0, pw / 2] : [-pw / 2, 0], blocks: bl, heavyOk: true, tipIce: true }; },
  icetwin: r => { const d = r.i(36, 44), w = r.i(28, 32), h = r.i(38, 48), bl = [B('ice', -d, 0, w, h), B(r.p(0.5) ? 'ice' : 'wood', -d, h, w, h), B('ice', d, 0, w, h), B(ws(r), d, h, w, h), B('wood', 0, 2 * h, 2 * d + w + 6, 12), B(ws(r), 0, 2 * h + 12, 28, 28)];
    return { names: ['Ice gate', 'Frost towers', 'Cold arch'], w: 2 * d + w + r.i(6, 20), ice: r.p(0.4), blocks: bl, heavyOk: true }; },
  icepyr: r => { const w = r.i(28, 34); return { names: ['Igloo', 'Snow pile', 'Ice heap'], w: 3 * w + r.i(8, 26), ice: r.p(0.3),
    blocks: [B('ice', -w, 0, w, w), B(r.p(0.5) ? 'stone' : 'ice', 0, 0, w, w), B('ice', w, 0, w, w), B(ws(r), -w / 2, w, w, w), B(ws(r), w / 2, w, w, w), B('wood', 0, 2 * w, w, w)], heavyOk: true }; },
  icewedge: r => { const w = r.i(30, 36), bl = [B('stone', -w, 0, w, r.i(34, 42)), B('ice', 0, 0, w, r.i(34, 42)), B('wood', w, 0, w, r.i(34, 42))]; const h = Math.max(...bl.map(b => b.h)); bl.forEach(b => { b.h = h; });
    bl.push(B('ice', 0, h, 3 * w - 10, 16), B(ws(r), r.i(-20, 20), h + 16, 30, 30)); return { names: ['Cold shelf', 'Freezer', 'Ice lid'], w: 3 * w + r.i(8, 24), blocks: bl, heavyOk: true }; },
  // --- set 4: seesaw plank (pin) and hanging weight (rope) ---
  seesawIntro: r => { const pw = r.i(100, 120), H = r.i(32, 46), e = pw / 2 - 16, right = r.p(0.3), sd = right ? 1 : -1, bl = [B('wood', 0, H, pw, 10, { pin: true }), B('wood', sd * (e - 2), 0, 16, H), B('wood', sd * e, H + 10, 30, r.i(30, 38))];
    if (r.p(0.6)) bl.push(B('wood', -sd * e, H + 10, 26, r.i(24, 30)));
    return { names: ['Seesaw'], w: pw - r.i(16, 28), intro: true, tip: 'Knock out the leg and the plank tips.', blocks: bl }; },
  seesaw: r => { const pw = r.i(100, 130), H = r.i(30, 50), e = pw / 2 - 16, side = r.pick([-1, 1, 0]), bl = [B('wood', 0, H, pw, 10, { pin: true })];
    const leg = s => bl.push(B(r.pick(['wood', 'wood', 'glass']), s * (e - 2), 0, 16, H));
    if (side === 0) { leg(-1); leg(1); bl.push(...column(r, -e, H + 10, r.i(1, 2), 28, 28, 34, () => ws(r)), ...column(r, e, H + 10, r.i(1, 2), 28, 28, 34, () => ws(r))); }
    else { leg(side); bl.push(B('stone', side * e, H + 10, 30, 30)); if (r.p(0.5)) bl.push(B('wood', side * e, H + 40, 26, 26)); bl.push(B('wood', -side * e, H + 10, 28, r.i(28, 36))); }
    if (r.p(0.4)) bl.push(B('wood', 0, H + 10, 26, r.i(26, 40)));
    return { names: ['Tipping point', 'Playground', 'Lever'], w: pw - r.i(4, 14), blocks: bl, heavyOk: true }; },
  seesawTower: r => { const pw = r.i(96, 116), H = r.i(28, 40), e = pw / 2 - 12, bl = [B('wood', 0, H, pw, 10, { pin: true }), B('wood', -e, 0, 16, H), B('wood', e, 0, 16, H)];
    bl.push(...column(r, 0, H + 10, r.i(3, 4), r.i(28, 34), 28, 36, () => ws(r))); return { names: ['Top heavy', 'Balancing act', 'Circus'], w: pw + r.i(-6, 4), blocks: bl, heavyOk: true }; },
  ropeIntro: r => { const w = r.i(32, 38), bl = column(r, 14, 0, 3, w, 30, 38, () => 'wood'), wy = r.i(34, 60), ww = 28;
    bl.push(B('stone', 14 - w / 2 - r.i(24, 34) - ww / 2, wy, ww, ww, { rope: [0, r.i(170, 215)] })); const k = bl[bl.length - 1]; k.rope[0] = k.x;
    return { names: ['Plumb line', 'Tetherball', 'Conker'], w: w + r.i(40, 56), blocks: bl, tipRope: true }; },
  wrecker: r => { const w = r.i(30, 36), tx = r.i(10, 26), bl = column(r, tx, 0, r.i(3, 4), w, 30, 38, () => ws(r)), ww = r.i(26, 32), wx = tx - w / 2 - r.i(22, 40) - ww / 2;
    bl.push(B('stone', wx, r.i(30, 80), ww, ww, { rope: [wx, r.i(170, 220)] })); return { names: ['Wrecking weight', 'Demolition', 'Crane'], w: w + r.i(44, 64), blocks: bl, heavyOk: true, tipRope: true }; },
  wreckerBridge: r => { const d = r.i(36, 42), lh = r.i(48, 60), bl = [B('wood', -d, 0, 18, lh), B('wood', d, 0, 18, lh), B('wood', 0, lh, 2 * d + 30, 12), B(ws(r), 0, lh + 12, 30, 30), B(ws(r), 0, 0, 28, 28)];
    const ww = r.i(26, 30), wx = -d - 9 - r.i(20, 34) - ww / 2; bl.push(B('stone', wx, r.i(16, lh), ww, ww, { rope: [wx, r.i(170, 220)] }));
    return { names: ['Swing bridge', 'Battering ram', 'Knocker'], w: 2 * d + r.i(22, 34), blocks: bl, heavyOk: true, tipRope: true }; },
  // a weight hangs between two towers: swing it either way
  bellTwin: r => { const d = r.i(44, 52), w = r.i(26, 30), h = r.i(36, 44), bl = [B('wood', -d, 0, w, h), B(ws(r), -d, h, w, h), B(ws(r), d, 0, w, h), B('wood', d, h, w, h)];
    if (r.p(0.5)) bl.push(B('wood', -d, 2 * h, w - 2, 26)); const ww = r.i(26, 30); bl.push(B('stone', 0, r.i(20, 2 * h - ww), ww, ww, { rope: [0, r.i(170, 220)] }));
    return { names: ['Bell', 'Clapper', 'Pendulum'], w: 2 * d + w + r.i(4, 14), blocks: bl, heavyOk: true, tipRope: true }; },
  // the weight hangs over the high end of a seesaw
  ropeSeesaw: r => { const pw = r.i(104, 124), H = r.i(34, 46), e = pw / 2 - 16, bl = [B('wood', 0, H, pw, 10, { pin: true }), B('wood', e - 2, 0, 16, H), B('stone', e, H + 10, 30, 30), B('wood', -e, H + 10, 28, 30)];
    if (r.p(0.5)) bl.push(B('wood', e, H + 40, 26, 26)); const ww = 28, wx = -pw / 2 - r.i(18, 30) - ww / 2; bl.push(B('stone', wx, r.i(H + 6, H + 50), ww, ww, { rope: [wx, r.i(180, 220)] }));
    return { names: ['Hammer and plank', 'Dunk tank', 'Drawbridge'], w: pw - r.i(4, 14), blocks: bl, heavyOk: true, tipRope: true }; }
};
const PLAN = {
  1: ['stack', 'tall', 'widebase', 'table', 'bridge', 'fort', 'twin', 'pyramid', 'steps'],
  2: ['glassIntro', 'glasswall', 'glasslegs', 'glasstower', 'tntside', 'tntside', 'tntunder', 'tntunder', 'tnttop', 'tntfort', 'glasstwin'],
  3: ['iceIntro', 'icestack', 'icerow', 'icerow', 'icebase', 'icetable', 'halfice', 'halfice', 'icetwin', 'icepyr', 'icewedge'],
  4: ['seesawIntro', 'seesaw', 'seesaw', 'seesawTower', 'ropeIntro', 'wrecker', 'wreckerBridge', 'bellTwin', 'ropeSeesaw']
};
// the 10 levels of the first rough version go through the same tests (was = their old number, used to carry old saved stars across)
const HAND = [
  { set: 1, was: 0, tpl: 'stack', name: 'Stack', intro: true, tip: 'Pull back, let go.', platform: { x: 270, w: 72 }, blocks: [B('wood', 0, 0, 40, 40), B('wood', 0, 40, 40, 40), B('wood', 0, 80, 40, 40)] },
  { set: 1, was: 1, tpl: 'tall', name: 'Tall and thin', platform: { x: 270, w: 64 }, blocks: [0, 36, 72, 108, 144].map(y => B('wood', 0, y, 28, 36)) },
  { set: 1, was: 2, tpl: 'widebase', name: 'Wide base', platform: { x: 270, w: 58 }, blocks: [B('wood', 0, 0, 100, 14), B('wood', 0, 14, 30, 40), B('wood', 0, 54, 30, 40), B('wood', 0, 94, 30, 40)] },
  { set: 1, was: 3, tpl: 'table', name: 'Stone on legs', platform: { x: 270, w: 84 }, blocks: [B('wood', -24, 0, 16, 50), B('wood', 24, 0, 16, 50), B('stone', 0, 50, 76, 26)] },
  { set: 1, was: 5, tpl: 'bridge', name: 'Bridge', heavyOk: true, platform: { x: 266, w: 106 }, blocks: [B('wood', -42, 0, 18, 60), B('wood', 42, 0, 18, 60), B('wood', 0, 60, 116, 12), B('stone', 0, 72, 32, 32), B('wood', 0, 0, 30, 30)] },
  { set: 2, was: 4, tpl: 'glasswall', name: 'Glass in the way', heavyOk: true, platform: { x: 266, w: 110 }, blocks: [B('glass', -42, 0, 12, 90), B('wood', 8, 0, 36, 36), B('stone', 8, 36, 36, 32), B('wood', 8, 68, 32, 32)] },
  { set: 2, was: 7, tpl: 'glasslegs', name: 'Glass legs', heavyOk: true, platform: { x: 266, w: 116 }, blocks: [B('glass', -28, 0, 14, 50), B('glass', 28, 0, 14, 50), B('stone', 0, 50, 84, 22), B('tnt', 0, 72, 26, 26), B('wood', 0, 98, 30, 30)] },
  { set: 2, was: 8, tpl: 'tntfort', name: 'The fort', heavyOk: true, platform: { x: 260, w: 146 }, blocks: [B('glass', -50, 0, 14, 50), B('tnt', -20, 0, 28, 44), B('stone', 50, 0, 28, 50), B('wood', 0, 50, 128, 12), B('stone', 6, 62, 30, 30), B('wood', 6, 92, 30, 30), B('stone', 44, 62, 28, 28)] },
  { set: 2, was: 9, tpl: 'glasstwin', name: 'Two towers', heavyOk: true, platform: { x: 264, w: 116 }, blocks: [B('wood', -44, 0, 28, 48), B('wood', -44, 48, 28, 48), B('stone', 44, 0, 32, 44), B('glass', 44, 44, 28, 52), B('wood', 0, 96, 124, 12), B('wood', 0, 108, 28, 28)] }
];

function makeCandidates() {
  const all = [];
  if (!ONLY.length) HAND.forEach((h, k) => all.push(Object.assign({ id: 'old-' + h.was, hand: true, shots: ['n'] }, h)));
  for (const set of [1, 2, 3, 4]) {
    const plan = PLAN[set].filter(t => !ONLY.length || ONLY.includes(t)); let made = 0, tries = 0; if (!plan.length) continue;
    while (made < N && tries++ < N * 20) {
      const tpl = plan[tries % plan.length], isIntro = /Intro$/.test(tpl) && tpl !== 'ropeIntro';
      if (isIntro && !ONLY.length && tries % (plan.length * 3) >= plan.length * 2) continue;        // fewer intro variants than the rest
      const r = rng(SEED * 100003 + set * 7919 + tries * 131), t = T[tpl](r);
      const lo = Math.min(-t.w / 2, ...t.blocks.map(b => b.x - b.w / 2)), hi = Math.max(t.w / 2, ...t.blocks.map(b => b.x + b.w / 2));
      const px = Math.round(Math.min(272, LIMIT.rightEdge - hi));
      if (px + lo < LIMIT.leftEdge - (t.blocks.some(b => b.rope) ? 40 : 0)) continue;                 // too close to the cannon
      if (Math.max(...t.blocks.map(b => Math.max(b.y + b.h, b.rope ? b.rope[1] + 8 : 0))) > LIMIT.maxHeight) continue;
      const L = { id: 's' + set + '-' + tpl + '-' + tries, set, tpl, names: t.names, intro: !!t.intro, heavyOk: !!(t.heavyOk && r.p(0.45)), shots: ['n'],
        platform: { x: px, w: Math.round(t.w) }, blocks: t.blocks };
      if (t.ice) L.platform.ice = t.ice === true ? true : t.ice.map(Math.round);
      if (t.tip) L.tip = t.tip;
      all.push(L); made++;
    }
  }
  return all;
}

// ---------- measuring (runs inside the game page) ----------
function measure({ L, lim, seed }) {
  const cc = window.__cc, out = { id: L.id };
  const st = cc.stand(L, 360); out.drift = st.worst;
  if (!st.ok) { out.rej = 'unstable'; return out; }
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const shot = t => [5 + rnd() * 70, 0.25 + rnd() * 0.75, t], lvl = shots => Object.assign({}, L, { shots });
  let q = 0; for (let k = 0; k < 60; k++) if (cc.run(lvl(['n']), [shot('n')]).remaining === 0) q++;
  if (q / 60 > lim * 1.6) { out.rej = 'trivial'; out.single = q / 60; return out; }
  // search: every angle and power on a grid for the first shot, keep the three best starts, try every second shot, and so on
  const AN = [8, 15, 22, 29, 36, 43, 50, 57, 64, 71], PW = [0.35, 0.48, 0.61, 0.74, 0.87, 1], types = L.heavyOk ? ['n', 'h'] : ['n'];
  let beam = [[]], best = null, runs = 0;
  for (let d = 1; d <= 4 && !best; d++) {
    const res = [];
    for (const pre of beam) for (const t of types) {
      if (t === 'h' && pre.some(x => x[2] === 'h')) continue;
      for (const a of AN) for (const p of PW) {
        const seq = pre.concat([[a, p, t]]), o = cc.run(lvl(seq.map(x => x[2])), seq); runs++;
        if (o.phase === 'won') { if (!best || o.used < best.length || (o.used === best.length && t === 'n' && best.some(x => x[2] === 'h'))) best = seq.slice(0, o.used); }
        else res.push({ seq, r: o.remaining });
      }
    }
    res.sort((x, y) => x.r - y.r); beam = res.slice(0, 3).map(x => x.seq);
  }
  out.runs = runs;
  if (!best) { out.rej = 'unwinnable'; return out; }
  const n = Math.min(5, Math.max(3, best.length + 2)), nh = best.some(x => x[2] === 'h') || L.heavyOk ? 1 : 0;
  const shots = []; for (let k = 0; k < n - nh; k++) shots.push('n'); if (nh) shots.push('h');
  const F = lvl(shots), ty = [...new Set(shots)];
  let single = 0, hit = 0; const NS = 150, NQ = 160;
  for (let k = 0; k < NS; k++) { const o = cc.run(F, [shot(ty[Math.floor(rnd() * ty.length)])]); if (o.remaining === 0) single++; if (o.remaining < L.blocks.filter(b => !b.pin && !b.rope).length) hit++; }
  let wins = 0, near = 0, used = 0, nearSeq = null;
  for (let k = 0; k < NQ; k++) {
    const order = shots.slice().sort(() => rnd() - 0.5), seq = order.map(shot), o = cc.run(F, seq);
    if (o.phase === 'won') { wins++; used += o.used; if (o.used < best.length) best = seq.slice(0, o.used); }
    else if (o.phase === 'lost' && (o.remaining === 1 || o.remaining === 2)) { near++; if (o.remaining === 1 && !nearSeq) nearSeq = seq; }
  }
  Object.assign(out, { shots, best: best.length, bestSeq: best, single: single / NS, hit: hit / NS, win: wins / NQ, near: near / NQ, nearSeq });
  return out;
}

// ---------- run ----------
let results;
if (PICK) results = JSON.parse(fs.readFileSync(OUT, 'utf8'));
else {
  const cands = makeCandidates();
  console.log('candidates: ' + [1, 2, 3, 4].map(s => SETS[s - 1] + ' ' + cands.filter(c => c.set === s).length).join(', '));
  const PORT = 8000 + Math.floor(Math.random() * 900);
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const stub = 'window.SETS=' + JSON.stringify(SETS) + ';window.LEVELS=[{id:"x",set:1,name:"x",shots:["n"],platform:{x:270,w:72},blocks:[{m:"wood",x:0,y:0,w:40,h:40}]}];';
  const workers = [], queue = cands.slice(), measured = []; let done = 0; const t0 = Date.now();
  try {
    for (let wk = 0; wk < 2; wk++) {
      const browser = await chromium.launch(); const page = await browser.newPage();
      await page.route('**/levels.js', rt => rt.fulfill({ contentType: 'text/javascript', body: stub }));
      await page.goto(`http://127.0.0.1:${PORT}/index.html`); await page.waitForFunction(() => window.__cc);
      workers.push((async () => {
        while (queue.length) {
          const L = queue.shift();
          const m = await page.evaluate(measure, { L, lim: L.intro ? LIMIT.singleIntro : LIMIT.single, seed: 4242 });
          measured.push(Object.assign({}, L, { m })); done++;
          if (done % 25 === 0) console.log(`  ${done}/${cands.length} measured, ${Math.round((Date.now() - t0) / 1000)} s`);
        }
        await browser.close();
      })());
    }
    await Promise.all(workers);
  } finally { server.kill(); }
  results = { seed: SEED, n: N, generated: {}, rejected: {}, tpl: {}, survivors: [] };
  for (const s of [1, 2, 3, 4]) {
    const mine = measured.filter(c => c.set === s), rej = { unstable: 0, unwinnable: 0, trivial: 0, 'no near miss': 0 };
    for (const c of mine) {
      const m = c.m, lim = c.intro ? LIMIT.singleIntro : LIMIT.single;
      if (!m.rej && m.single > lim) m.rej = 'trivial';
      if (!m.rej && m.near < LIMIT.nearMin) m.rej = 'no near miss';
      if (m.rej) rej[m.rej]++; else results.survivors.push(c);
      const t = (results.tpl[c.tpl] ||= { made: 0, kept: 0 }); t.made++; if (m.rej) t[m.rej] = (t[m.rej] || 0) + 1; else t.kept++;
    }
    results.generated[s] = mine.length; results.rejected[s] = rej;
  }
  if (ONLY.length) {   // keep everything measured before, swap in the re-measured templates
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const t of ONLY) delete old.tpl[t];
    for (const c of measured) { const prev = old.survivors.filter(x => x.tpl === c.tpl).length, s = c.set; if (prev) { old.generated[s] -= 0; } }
    for (const s of [1, 2, 3, 4]) {
      const gone = old.survivors.filter(x => x.set === s && ONLY.includes(x.tpl));
      old.survivors = old.survivors.filter(x => !gone.includes(x));
      old.generated[s] += (results.generated[s] || 0); for (const k in results.rejected[s] || {}) old.rejected[s][k] += results.rejected[s][k];
    }
    old.survivors.push(...results.survivors); Object.assign(old.tpl, results.tpl); results = old;
  }
  results.survivors.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.writeFileSync(OUT, JSON.stringify(results));
}

console.log('by template: ' + Object.entries(results.tpl).map(([k, v]) => k + ' ' + JSON.stringify(v)).join('\n  '));
// ---------- choose ten per set ----------
const has = (c, f) => (f === 'iceplat' ? !!c.platform.ice : c.blocks.some(b => (f === 'pin' || f === 'rope' ? b[f] : b.m === f)));
const WANT = { 1: [], 2: [['glass', 4], ['tnt', 4]], 3: [['ice', 6], ['iceplat', 3]], 4: [['pin', 3], ['rope', 4]] };
const TIPS = { 2: ['tnt', 'TNT blows its neighbours away.'], 3: ['iceplat', 'The pale part of the platform is ice.'], 4: ['rope', 'Hit the hanging weight to swing it.'] };
const final = [], rows = [], summary = [];
for (const s of [1, 2, 3, 4]) {
  const pool = results.survivors.filter(c => c.set === s), q = c => c.m.near + (c.hand ? 0.1 : 0) + (c.m.near >= LIMIT.nearGood ? 1 : 0) + Math.min(0.15, c.m.win * 3);
  const intros = pool.filter(c => c.intro).sort((a, b) => (b.m.win + (b.m.near >= LIMIT.nearGood ? 1 : 0)) - (a.m.win + (a.m.near >= LIMIT.nearGood ? 1 : 0))),   // a set's first level: the gentlest
  rest = pool.filter(c => !c.intro).sort((a, b) => q(b) - q(a));
  if (!intros.length) throw new Error('no usable first level for set ' + s);
  const chosen = [], count = { [intros[0].tpl]: 1 }, take = c => { chosen.push(c); count[c.tpl] = (count[c.tpl] || 0) + 1; }, got = f => chosen.concat([intros[0]]).filter(x => has(x, f)).length;
  for (const [f, n] of WANT[s]) for (const c of rest) { if (got(f) >= n) break; if (!chosen.includes(c) && has(c, f) && (count[c.tpl] || 0) < 2) take(c); }
  for (const cap of [1, 2, 3, 9])   // one of each template first, then seconds
    for (const c of rest) if (chosen.length < 9 && !chosen.includes(c) && (count[c.tpl] || 0) < cap && (cap === 9 || c.m.near >= LIMIT.nearGood)) take(c);
  chosen.splice(9);
  chosen.sort((a, b) => (b.m.win - a.m.win) || (a.m.best - b.m.best));            // easiest first: most random attempts win
  const list = [intros[0]].concat(chosen), usedNames = new Set(final.map(l => l.name).concat(list.map(c => c.name).filter(Boolean)));
  const tipFor = TIPS[s] && list.slice(1).find(c => has(c, TIPS[s][0]));
  list.forEach((c, i) => {
    let name = c.name; if (!name) { if (c.tpl === 'ropeIntro') c.names = ['Wrecking weight', 'Plumb line', 'Tetherball']; name = c.names.find(n => !usedNames.has(n)) || c.names[0] + ' ' + (i + 1); } usedNames.add(name);
    const L = { id: c.id, set: s, name }; if (typeof c.was === 'number') L.was = c.was;
    if (c.tip) L.tip = c.tip; else if (c === tipFor) L.tip = TIPS[s][1];
    L.shots = c.m.shots; L.platform = c.platform; L.blocks = c.blocks; final.push(L);
    rows.push(`| ${SETS[s - 1]} | ${i + 1} | ${name} | ${c.tpl}${c.hand ? ' (by hand)' : ''} | ${c.m.shots.join('')} | ${c.blocks.filter(b => !b.pin && !b.rope).length} | ${c.m.drift.toFixed(2)} | ${c.m.best} | ${(c.m.single * 100).toFixed(1)}% | ${(c.m.win * 100).toFixed(1)}% | ${(c.m.near * 100).toFixed(1)}% |`);
  });
  const rg = k => { const v = list.map(c => c.m[k] * 100); return Math.min(...v).toFixed(1) + ' to ' + Math.max(...v).toFixed(1) + '%'; };
  summary.push(`| ${SETS[s - 1]} | ${results.generated[s]} | ${pool.length} | ${Object.entries(results.rejected[s]).map(([k, v]) => v + ' ' + k).join(', ')} | ${list.length} | ${rg('single')} | ${rg('near')} | ${list.filter(c => c.m.near >= LIMIT.nearGood).length} |`);
  for (const [f, n] of WANT[s]) { const k = list.filter(c => has(c, f)).length; if (k < n) console.log(`  note: set ${s} has only ${k} levels with ${f} (wanted ${n})`); }
  if (list.length < 10) console.log(`  note: set ${s} has only ${list.length} levels`);
}

// ---------- write levels.js and the table ----------
const blk = b => `{ m: '${b.m}', x: ${b.x}, y: ${b.y}, w: ${b.w}, h: ${b.h}${b.pin ? ', pin: true' : ''}${b.rope ? `, rope: [${b.rope[0]}, ${b.rope[1]}]` : ''} }`;
const head = `/* Cannon Collapse level data: plain data, four sets of ten. Add or change levels by hand here.
   The levels below were made and measured by tools/level-lab.mjs (numbers in tools/level-table.md). Running the lab
   again rewrites this file, so keep hand-made levels in the HAND list in the lab, or stop running the lab.

   id:       any name that is not used twice. Saved stars are kept under it, so do not rename a level people have played.
   set:      1 to ${SETS.length} (names in SETS). Levels play in the order they are listed; keep a set's levels together, easiest first.
   was:      (optional) the level's number in the first 10-level version, so old saved stars carry across.
   tip:      (optional) one short line shown before the first shot.
   shots:    'n' = normal ball, 'h' = heavy ball. The player may fire them in any order.
   platform: x = centre on a 360-wide field, w = width, top = height of its top (optional, default 390; smaller = higher),
             ice = true for an all-ice top, or [from, to] measured from the platform centre for an ice section.
   blocks:   x = block centre, measured from the platform centre (minus = towards the cannon)
             y = how far the block's BOTTOM sits above the platform top
             w, h = size
             m = what it is made of:
               wood   light, slides a little
               stone  heavy, grips
               glass  breaks on a hard hit (a broken block counts as cleared)
               tnt    goes off on a hard hit and throws its neighbours outward
               ice    very slippery: a nudge sends it, and what stands on it, sliding
             pin: true      the block turns on a fixed pivot at its centre (a seesaw plank). It stays; it is not counted.
             rope: [x, y]   the block hangs from a fixed point at x (from the platform centre), y above the platform top.
                            It swings when hit. It stays; it is not counted. Use wood or stone for pin and rope blocks.
   Keep everything between x = 182 and 338 on the field and no taller than ${LIMIT.maxHeight} above the platform, so it fits small phones.
   After changing a level run tools/play-check.mjs: it checks every level stands, can be cleared, and is not a gift. */
window.SETS = ${JSON.stringify(SETS).replace(/"/g, "'").replace(/,/g, ', ')};
window.LEVELS = [
`;
const body = final.map((L, i) => {
  const p = L.platform, pl = `{ x: ${p.x}, w: ${p.w}${p.top ? ', top: ' + p.top : ''}${p.ice ? ', ice: ' + (p.ice === true ? 'true' : '[' + p.ice.join(', ') + ']') : ''} }`;
  const lines = []; for (let k = 0; k < L.blocks.length; k += 3) lines.push('    ' + L.blocks.slice(k, k + 3).map(blk).join(', '));
  return (i % 10 === 0 ? `  // ---- set ${L.set}: ${SETS[L.set - 1]} ----\n` : '') +
    `  { id: '${L.id}', set: ${L.set}, name: ${JSON.stringify(L.name).replace(/"/g, "'")},${typeof L.was === 'number' ? ' was: ' + L.was + ',' : ''}${L.tip ? " tip: '" + L.tip + "'," : ''} shots: [${L.shots.map(x => "'" + x + "'").join(', ')}],\n    platform: ${pl}, blocks: [\n${lines.join(',\n')} ] }`;
}).join(',\n');
fs.writeFileSync(path.join(DIR, 'levels.js'), head + body + '\n];\n');
fs.writeFileSync(path.join(HERE, 'level-table.md'), `# Level table (made by tools/level-lab.mjs, seed ${results.seed}, ${results.n} candidates per set plus the old levels)

How to read it: "1st shot clears" is the share of single random shots (angle 5 to 75 degrees, power 25 to 100%) that clear the level outright;
the limit is ${LIMIT.single * 100}% (${LIMIT.singleIntro * 100}% for a set's first level). "Random attempts win" and "end 1-2 left" are from ${160} random full attempts with the level's shots;
"end 1-2 left" is the near miss rate (levels under ${LIMIT.nearMin * 100}% were thrown out, ${LIMIT.nearGood * 100}% or more preferred). "Best" is the fewest shots the search found;
shots given = best + 2 (at least 3, at most 5). Within a set, levels run from the most random wins to the fewest (ties: fewer best shots first); a set's first level is the gentlest of the
levels that show the new piece alone. No more than two levels from one template in a set.

## Per set

| Set | Candidates | Survived | Thrown out | Kept | 1st shot clears (range) | Near miss rate (range) | Kept at ${LIMIT.nearGood * 100}%+ near miss |
|---|---|---|---|---|---|---|---|
${summary.join('\n')}

## Kept levels

| Set | No. | Name | Template | Shots | Blocks | Drift in 3 s (px) | Best | 1st shot clears | Random attempts win | End 1-2 left |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`);
console.log(summary.join('\n')); console.log('wrote levels.js (' + final.length + ' levels) and tools/level-table.md');
