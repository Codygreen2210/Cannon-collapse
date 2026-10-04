/* Cannon Collapse level data: plain data, four sets of ten. Add or change levels by hand here.
   The levels below were made and measured by tools/level-lab.mjs (numbers in tools/level-table.md). Running the lab
   again rewrites this file, so keep hand-made levels in the HAND list in the lab, or stop running the lab.

   id:       any name that is not used twice. Saved stars are kept under it, so do not rename a level people have played.
   set:      1 to 4 (names in SETS). Levels play in the order they are listed; keep a set's levels together, easiest first.
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
   Keep everything between x = 182 and 338 on the field and no taller than 225 above the platform, so it fits small phones.
   After changing a level run tools/play-check.mjs: it checks every level stands, can be cleared, and is not a gift. */
window.SETS = ['Timber', 'Glass and powder', 'Ice', 'Balance'];
window.LEVELS = [
  // ---- set 1: Timber ----
  { id: 'old-0', set: 1, name: 'Stack', was: 0, tip: 'Pull back, let go.', shots: ['n', 'n', 'n'],
    platform: { x: 270, w: 72 }, blocks: [
    { m: 'wood', x: 0, y: 0, w: 40, h: 40 }, { m: 'wood', x: 0, y: 40, w: 40, h: 40 }, { m: 'wood', x: 0, y: 80, w: 40, h: 40 } ] },
  { id: 'old-2', set: 1, name: 'Wide base', was: 2, shots: ['n', 'n', 'n', 'n'],
    platform: { x: 270, w: 58 }, blocks: [
    { m: 'wood', x: 0, y: 0, w: 100, h: 14 }, { m: 'wood', x: 0, y: 14, w: 30, h: 40 }, { m: 'wood', x: 0, y: 54, w: 30, h: 40 },
    { m: 'wood', x: 0, y: 94, w: 30, h: 40 } ] },
  { id: 'old-1', set: 1, name: 'Tall and thin', was: 1, shots: ['n', 'n', 'n'],
    platform: { x: 270, w: 64 }, blocks: [
    { m: 'wood', x: 0, y: 0, w: 28, h: 36 }, { m: 'wood', x: 0, y: 36, w: 28, h: 36 }, { m: 'wood', x: 0, y: 72, w: 28, h: 36 },
    { m: 'wood', x: 0, y: 108, w: 28, h: 36 }, { m: 'wood', x: 0, y: 144, w: 28, h: 36 } ] },
  { id: 's1-stack-90', set: 1, name: 'Crates', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 66 }, blocks: [
    { m: 'stone', x: 0, y: 0, w: 34, h: 34 }, { m: 'wood', x: 0, y: 34, w: 32, h: 36 }, { m: 'wood', x: 0, y: 70, w: 31, h: 28 },
    { m: 'wood', x: 0, y: 98, w: 32, h: 37 }, { m: 'stone', x: 0, y: 135, w: 33, h: 36 } ] },
  { id: 's1-table-75', set: 1, name: 'Stone on legs', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 85 }, blocks: [
    { m: 'wood', x: -24, y: 0, w: 15, h: 49 }, { m: 'wood', x: 24, y: 0, w: 15, h: 49 }, { m: 'stone', x: 0, y: 49, w: 75, h: 25 },
    { m: 'wood', x: 0, y: 0, w: 24, h: 22 } ] },
  { id: 's1-twin-42', set: 1, name: 'Two towers', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 118 }, blocks: [
    { m: 'wood', x: -42, y: 0, w: 27, h: 45 }, { m: 'wood', x: -42, y: 45, w: 27, h: 45 }, { m: 'wood', x: 42, y: 0, w: 27, h: 45 },
    { m: 'wood', x: 42, y: 45, w: 27, h: 45 } ] },
  { id: 's1-bridge-49', set: 1, name: 'Bridge', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 101 }, blocks: [
    { m: 'wood', x: -38, y: 0, w: 17, h: 55 }, { m: 'wood', x: 38, y: 0, w: 17, h: 55 }, { m: 'wood', x: 0, y: 55, w: 107, h: 12 },
    { m: 'wood', x: 3, y: 67, w: 30, h: 30 }, { m: 'wood', x: 0, y: 0, w: 31, h: 28 } ] },
  { id: 's1-fort-50', set: 1, name: 'The fort', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 122 }, blocks: [
    { m: 'wood', x: -43, y: 0, w: 24, h: 46 }, { m: 'stone', x: 43, y: 0, w: 24, h: 46 }, { m: 'wood', x: 0, y: 46, w: 114, h: 12 },
    { m: 'wood', x: 2, y: 58, w: 30, h: 30 } ] },
  { id: 's1-pyramid-16', set: 1, name: 'Pyramid', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 100 }, blocks: [
    { m: 'wood', x: -30, y: 0, w: 30, h: 30 }, { m: 'wood', x: 0, y: 0, w: 30, h: 30 }, { m: 'wood', x: 30, y: 0, w: 30, h: 30 },
    { m: 'wood', x: -15, y: 30, w: 30, h: 30 }, { m: 'wood', x: 15, y: 30, w: 30, h: 30 }, { m: 'wood', x: 0, y: 60, w: 30, h: 30 } ] },
  { id: 's1-steps-8', set: 1, name: 'Steps', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 96 }, blocks: [
    { m: 'wood', x: -28, y: 0, w: 28, h: 27 }, { m: 'wood', x: 0, y: 0, w: 28, h: 27 }, { m: 'wood', x: 0, y: 27, w: 28, h: 27 },
    { m: 'wood', x: 28, y: 0, w: 28, h: 27 }, { m: 'wood', x: 28, y: 27, w: 28, h: 27 }, { m: 'wood', x: 28, y: 54, w: 28, h: 27 } ] },
  // ---- set 2: Glass and powder ----
  { id: 's2-glassIntro-77', set: 2, name: 'Glass', tip: 'Glass breaks on a hard hit.', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 80 }, blocks: [
    { m: 'glass', x: 0, y: 0, w: 36, h: 34 }, { m: 'glass', x: 0, y: 34, w: 32, h: 38 }, { m: 'wood', x: 0, y: 72, w: 34, h: 32 } ] },
  { id: 'old-7', set: 2, name: 'Glass legs', was: 7, tip: 'TNT blows its neighbours away.', shots: ['n', 'n', 'h'],
    platform: { x: 266, w: 116 }, blocks: [
    { m: 'glass', x: -28, y: 0, w: 14, h: 50 }, { m: 'glass', x: 28, y: 0, w: 14, h: 50 }, { m: 'stone', x: 0, y: 50, w: 84, h: 22 },
    { m: 'tnt', x: 0, y: 72, w: 26, h: 26 }, { m: 'wood', x: 0, y: 98, w: 30, h: 30 } ] },
  { id: 's2-tntunder-6', set: 2, name: 'Under the table', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 271, w: 135 }, blocks: [
    { m: 'wood', x: -55, y: 0, w: 14, h: 47 }, { m: 'wood', x: 1, y: 0, w: 14, h: 47 }, { m: 'wood', x: -27, y: 47, w: 80, h: 12 },
    { m: 'wood', x: -27, y: 59, w: 28, h: 28 }, { m: 'tnt', x: -27, y: 0, w: 26, h: 26 }, { m: 'stone', x: 50, y: 0, w: 28, h: 53 },
    { m: 'wood', x: 50, y: 53, w: 26, h: 28 } ] },
  { id: 's2-glasstower-3', set: 2, name: 'Layer cake', shots: ['n', 'n', 'n', 'h'],
    platform: { x: 272, w: 72 }, blocks: [
    { m: 'stone', x: 0, y: 0, w: 37, h: 35 }, { m: 'glass', x: 0, y: 35, w: 37, h: 29 }, { m: 'wood', x: 0, y: 64, w: 37, h: 33 },
    { m: 'glass', x: 0, y: 97, w: 37, h: 36 }, { m: 'wood', x: 0, y: 133, w: 33, h: 35 } ] },
  { id: 's2-glasstower-91', set: 2, name: 'Sandwich', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 73 }, blocks: [
    { m: 'glass', x: 0, y: 0, w: 32, h: 32 }, { m: 'stone', x: 0, y: 32, w: 29, h: 30 }, { m: 'glass', x: 0, y: 62, w: 30, h: 33 },
    { m: 'wood', x: 0, y: 95, w: 30, h: 30 } ] },
  { id: 's2-glasswall-34', set: 2, name: 'Glass in the way', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 109 }, blocks: [
    { m: 'glass', x: -41, y: 0, w: 12, h: 72 }, { m: 'wood', x: 8, y: 0, w: 34, h: 30 }, { m: 'stone', x: 8, y: 30, w: 32, h: 36 },
    { m: 'wood', x: 8, y: 66, w: 32, h: 38 } ] },
  { id: 's2-glasstwin-43', set: 2, name: 'Glass towers', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 118 }, blocks: [
    { m: 'wood', x: -45, y: 0, w: 28, h: 44 }, { m: 'glass', x: -45, y: 44, w: 28, h: 44 }, { m: 'stone', x: 45, y: 0, w: 32, h: 40 },
    { m: 'glass', x: 45, y: 40, w: 28, h: 48 }, { m: 'wood', x: 0, y: 88, w: 126, h: 12 }, { m: 'wood', x: 0, y: 100, w: 28, h: 28 },
    { m: 'tnt', x: 0, y: 0, w: 26, h: 26 } ] },
  { id: 's2-tnttop-30', set: 2, name: 'Top shelf', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 75 }, blocks: [
    { m: 'stone', x: 0, y: 0, w: 46, h: 35 }, { m: 'wood', x: -12, y: 35, w: 21, h: 30 }, { m: 'wood', x: 13, y: 35, w: 21, h: 30 },
    { m: 'tnt', x: 0, y: 65, w: 28, h: 28 } ] },
  { id: 's2-glasslegs-13', set: 2, name: 'Glass table', shots: ['n', 'n', 'n', 'h'],
    platform: { x: 272, w: 102 }, blocks: [
    { m: 'glass', x: -26, y: 0, w: 14, h: 55 }, { m: 'glass', x: 26, y: 0, w: 14, h: 55 }, { m: 'stone', x: 0, y: 55, w: 80, h: 22 },
    { m: 'tnt', x: 0, y: 77, w: 26, h: 26 }, { m: 'wood', x: 0, y: 103, w: 30, h: 30 }, { m: 'stone', x: 0, y: 0, w: 24, h: 26 } ] },
  { id: 's2-tnttop-8', set: 2, name: 'Hat', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 79 }, blocks: [
    { m: 'stone', x: 0, y: 0, w: 45, h: 31 }, { m: 'wood', x: -12, y: 31, w: 21, h: 36 }, { m: 'wood', x: 12, y: 31, w: 21, h: 36 },
    { m: 'tnt', x: 0, y: 67, w: 28, h: 28 } ] },
  // ---- set 3: Ice ----
  { id: 's3-iceIntro-27', set: 3, name: 'Ice', tip: 'Ice slides. A nudge goes a long way.', shots: ['n', 'n', 'n'],
    platform: { x: 272, w: 56 }, blocks: [
    { m: 'ice', x: 0, y: 0, w: 34, h: 32 }, { m: 'ice', x: 0, y: 32, w: 30, h: 32 } ] },
  { id: 's3-icestack-12', set: 3, name: 'Ice cubes', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 78 }, blocks: [
    { m: 'ice', x: 0, y: 0, w: 37, h: 38 }, { m: 'ice', x: 0, y: 38, w: 34, h: 34 }, { m: 'ice', x: 0, y: 72, w: 37, h: 36 },
    { m: 'stone', x: 0, y: 108, w: 33, h: 30 } ] },
  { id: 's3-icestack-67', set: 3, name: 'Cold stack', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 75 }, blocks: [
    { m: 'ice', x: 0, y: 0, w: 35, h: 32 }, { m: 'ice', x: 0, y: 32, w: 33, h: 31 }, { m: 'ice', x: 0, y: 63, w: 32, h: 38 },
    { m: 'ice', x: 0, y: 101, w: 34, h: 30 } ] },
  { id: 's3-icetable-16', set: 3, name: 'Ice legs', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 115 }, blocks: [
    { m: 'ice', x: -26, y: 0, w: 19, h: 51 }, { m: 'ice', x: 26, y: 0, w: 20, h: 51 }, { m: 'stone', x: 0, y: 51, w: 80, h: 22 },
    { m: 'wood', x: 0, y: 73, w: 28, h: 28 } ] },
  { id: 's3-icerow-47', set: 3, name: 'Rink', tip: 'The pale part of the platform is ice.', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 110, ice: true }, blocks: [
    { m: 'ice', x: -28, y: 0, w: 25, h: 40 }, { m: 'ice', x: 0, y: 0, w: 25, h: 40 }, { m: 'ice', x: 28, y: 0, w: 25, h: 38 },
    { m: 'stone', x: -14, y: 40, w: 28, h: 28 } ] },
  { id: 's3-icebase-59', set: 3, name: 'Sled', shots: ['n', 'n', 'n', 'h'],
    platform: { x: 272, w: 117 }, blocks: [
    { m: 'ice', x: 0, y: 0, w: 86, h: 20 }, { m: 'wood', x: 0, y: 20, w: 32, h: 31 }, { m: 'wood', x: 0, y: 51, w: 32, h: 40 },
    { m: 'stone', x: 0, y: 91, w: 29, h: 36 } ] },
  { id: 's3-icepyr-31', set: 3, name: 'Igloo', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 98, ice: true }, blocks: [
    { m: 'ice', x: -30, y: 0, w: 30, h: 30 }, { m: 'ice', x: 0, y: 0, w: 30, h: 30 }, { m: 'ice', x: 30, y: 0, w: 30, h: 30 },
    { m: 'wood', x: -15, y: 30, w: 30, h: 30 }, { m: 'wood', x: 15, y: 30, w: 30, h: 30 }, { m: 'wood', x: 0, y: 60, w: 30, h: 30 } ] },
  { id: 's3-icebase-92', set: 3, name: 'Ice floe', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 109 }, blocks: [
    { m: 'ice', x: 0, y: 0, w: 79, h: 20 }, { m: 'wood', x: 0, y: 20, w: 32, h: 32 }, { m: 'wood', x: 0, y: 52, w: 31, h: 33 },
    { m: 'wood', x: 0, y: 85, w: 32, h: 39 } ] },
  { id: 's3-icetwin-8', set: 3, name: 'Ice gate', shots: ['n', 'n', 'n'],
    platform: { x: 272, w: 113, ice: true }, blocks: [
    { m: 'ice', x: -37, y: 0, w: 31, h: 39 }, { m: 'ice', x: -37, y: 39, w: 31, h: 39 }, { m: 'ice', x: 37, y: 0, w: 31, h: 39 },
    { m: 'wood', x: 37, y: 39, w: 31, h: 39 }, { m: 'wood', x: 0, y: 78, w: 111, h: 12 }, { m: 'wood', x: 0, y: 90, w: 28, h: 28 } ] },
  { id: 's3-halfice-29', set: 3, name: 'Half and half', shots: ['n', 'n', 'n', 'h'],
    platform: { x: 272, w: 129, ice: [0, 65] }, blocks: [
    { m: 'ice', x: 32, y: 0, w: 33, h: 38 }, { m: 'wood', x: 32, y: 38, w: 29, h: 38 }, { m: 'wood', x: 32, y: 76, w: 32, h: 37 },
    { m: 'stone', x: -32, y: 0, w: 31, h: 32 } ] },
  // ---- set 4: Balance ----
  { id: 's4-seesawIntro-10', set: 4, name: 'Seesaw', tip: 'Knock out the leg and the plank tips.', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 79 }, blocks: [
    { m: 'wood', x: 0, y: 43, w: 106, h: 10, pin: true }, { m: 'wood', x: -35, y: 0, w: 16, h: 43 }, { m: 'wood', x: -37, y: 53, w: 30, h: 38 } ] },
  { id: 's4-seesaw-91', set: 4, name: 'Tipping point', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 107 }, blocks: [
    { m: 'wood', x: 0, y: 34, w: 113, h: 10, pin: true }, { m: 'glass', x: -38, y: 0, w: 16, h: 34 }, { m: 'stone', x: -40, y: 44, w: 30, h: 30 },
    { m: 'wood', x: 41, y: 44, w: 28, h: 35 }, { m: 'wood', x: 0, y: 44, w: 26, h: 33 } ] },
  { id: 's4-ropeIntro-4', set: 4, name: 'Wrecking weight', tip: 'Hit the hanging weight to swing it.', shots: ['n', 'n', 'n'],
    platform: { x: 272, w: 81 }, blocks: [
    { m: 'wood', x: 14, y: 0, w: 32, h: 34 }, { m: 'wood', x: 14, y: 34, w: 28, h: 35 }, { m: 'wood', x: 14, y: 69, w: 31, h: 38 },
    { m: 'stone', x: -40, y: 53, w: 28, h: 28, rope: [-40, 188] } ] },
  { id: 's4-wrecker-59', set: 4, name: 'Demolition', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 85 }, blocks: [
    { m: 'wood', x: 10, y: 0, w: 35, h: 34 }, { m: 'wood', x: 10, y: 34, w: 31, h: 34 }, { m: 'wood', x: 10, y: 68, w: 34, h: 36 },
    { m: 'stone', x: 10, y: 104, w: 33, h: 35 }, { m: 'stone', x: -52, y: 76, w: 30, h: 30, rope: [-52.5, 211] } ] },
  { id: 's4-ropeIntro-58', set: 4, name: 'Plumb line', shots: ['n', 'n', 'n'],
    platform: { x: 272, w: 93 }, blocks: [
    { m: 'wood', x: 14, y: 0, w: 37, h: 31 }, { m: 'wood', x: 14, y: 31, w: 34, h: 31 }, { m: 'wood', x: 14, y: 62, w: 35, h: 35 },
    { m: 'stone', x: -52, y: 57, w: 28, h: 28, rope: [-52, 172] } ] },
  { id: 's4-wrecker-86', set: 4, name: 'Crane', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 83 }, blocks: [
    { m: 'stone', x: 23, y: 0, w: 31, h: 34 }, { m: 'wood', x: 23, y: 34, w: 30, h: 31 }, { m: 'wood', x: 23, y: 65, w: 31, h: 30 },
    { m: 'wood', x: 23, y: 95, w: 31, h: 37 }, { m: 'stone', x: -28, y: 61, w: 27, h: 27, rope: [-28, 199] } ] },
  { id: 's4-wreckerBridge-51', set: 4, name: 'Swing bridge', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 105 }, blocks: [
    { m: 'wood', x: -38, y: 0, w: 18, h: 60 }, { m: 'wood', x: 38, y: 0, w: 18, h: 60 }, { m: 'wood', x: 0, y: 60, w: 106, h: 12 },
    { m: 'wood', x: 0, y: 72, w: 30, h: 30 }, { m: 'wood', x: 0, y: 0, w: 28, h: 28 }, { m: 'stone', x: -94, y: 43, w: 28, h: 28, rope: [-94, 212] } ] },
  { id: 's4-wreckerBridge-96', set: 4, name: 'Battering ram', shots: ['n', 'n', 'n', 'n'],
    platform: { x: 272, w: 107 }, blocks: [
    { m: 'wood', x: -40, y: 0, w: 18, h: 56 }, { m: 'wood', x: 40, y: 0, w: 18, h: 56 }, { m: 'wood', x: 0, y: 56, w: 110, h: 12 },
    { m: 'wood', x: 0, y: 68, w: 30, h: 30 }, { m: 'wood', x: 0, y: 0, w: 28, h: 28 }, { m: 'stone', x: -91, y: 39, w: 27, h: 27, rope: [-91.5, 198] } ] },
  { id: 's4-bellTwin-25', set: 4, name: 'Bell', shots: ['n', 'n', 'h'],
    platform: { x: 272, w: 124 }, blocks: [
    { m: 'wood', x: -44, y: 0, w: 26, h: 38 }, { m: 'wood', x: -44, y: 38, w: 26, h: 38 }, { m: 'wood', x: 44, y: 0, w: 26, h: 38 },
    { m: 'wood', x: 44, y: 38, w: 26, h: 38 }, { m: 'wood', x: -44, y: 76, w: 24, h: 26 }, { m: 'stone', x: 0, y: 32, w: 28, h: 28, rope: [0, 215] } ] },
  { id: 's4-seesaw-19', set: 4, name: 'Playground', shots: ['n', 'n', 'n', 'h'],
    platform: { x: 272, w: 116 }, blocks: [
    { m: 'wood', x: 0, y: 44, w: 123, h: 10, pin: true }, { m: 'wood', x: -43, y: 0, w: 16, h: 44 }, { m: 'stone', x: -45, y: 54, w: 30, h: 30 },
    { m: 'wood', x: 46, y: 54, w: 28, h: 32 } ] }
];
