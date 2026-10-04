// A 14-block tower with every material in it. Not a level in the game: the play check and the picture tool use it to
// bring a lot down at once (frame cost, particle cap, the slow moment).
export const BIG = { id: 'check-big', set: 1, name: 'Big', shots: ['h', 'n', 'n'], platform: { x: 262, w: 128 }, blocks: [
  { x: -48, y: 0, w: 30, h: 30, m: 'wood' }, { x: -16, y: 0, w: 28, h: 28, m: 'tnt' }, { x: 16, y: 0, w: 30, h: 30, m: 'glass' }, { x: 48, y: 0, w: 30, h: 30, m: 'stone' },
  { x: 0, y: 30, w: 126, h: 12, m: 'wood' },
  { x: -45, y: 42, w: 30, h: 30, m: 'ice' }, { x: -15, y: 42, w: 30, h: 30, m: 'wood' }, { x: 15, y: 42, w: 30, h: 30, m: 'glass' }, { x: 45, y: 42, w: 30, h: 30, m: 'wood' },
  { x: 0, y: 72, w: 126, h: 12, m: 'wood' },
  { x: -30, y: 84, w: 30, h: 30, m: 'stone' }, { x: 0, y: 84, w: 28, h: 28, m: 'tnt' }, { x: 30, y: 84, w: 30, h: 30, m: 'wood' },
  { x: 0, y: 114, w: 80, h: 12, m: 'wood' }] };
