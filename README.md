# Cannon Collapse (40 levels, still plain boxes)

A phone browser game: pull back, let go, knock every block off the platform in as few shots as you can.
Plain boxes on purpose; art comes later. The shot, the hit and the collapse are unchanged from the first rough version.

## Play
Open `index.html` from any static host (or `python3 -m http.server` in this folder). No build step, no network calls,
no tracking, no cookies, no accounts. Progress (stars per level, where you were, sound on/off) sits in localStorage and the
game still works if storage is blocked. A save from the 10-level version is carried across; a damaged save starts fresh.

- Drag anywhere to aim, let go to fire. The dotted arc shows only the start of the path.
- After a retry, a faint grey arc shows your last first shot, so the next go is a correction and not a guess.
- Four sets of ten: **Timber** (wood, stone), **Glass and powder** (glass breaks, TNT blows its neighbours outward),
  **Ice** (slippery blocks and ice platform sections), **Balance** (a seesaw plank on a pivot, a weight on a rope).
  The plank and the hanging weight are furniture: they stay, and are not counted.
- The top bar shows "Set, level n of 10" and the star total. The row under it jumps between sets; a set opens when the
  one before has 15 of its 30 stars (`NEED` in `game.js`).
- Some levels have one heavy ball (marked H). Tap a ball in the Shots row to choose which goes next.
- Stars: 3 for one shot or two shots to spare, 2 for one to spare, 1 for clearing on the last shot. Each level gives the
  lab's best-found solution plus 2 shots (3 at least, 5 at most), so matching the bot is 3 stars.
- Restart is always one tap (or the R key).

## How the screen is used
The world is always the same size. The view shows it as wide as the screen allows, then slides it so the tower top sits
just under the top bar and the spare height becomes ground under the thumb (`place()` in `game.js`).

## Files
- `levels.js` the 40 levels as plain data, with the block types written out at the top. Written by the lab; fine to edit by hand
- `game.js` physics, feel, sound, drawing, and the `window.__cc` test hook
- `vendor/matter.min.js` matter-js 0.20.0 (MIT, licence beside it)
- `sfx/` seven short effects as mp3, plus `listen-report.txt` from `studio/senses/listen.py` (no new sounds in this step)
- `tools/make_sfx.py` makes the effects with numpy (`--mp3` to encode)
- `tools/level-lab.mjs` makes candidate levels from templates, plays each one headless, throws out the ones that fall over,
  cannot be cleared, are a gift, or never end in a near miss, picks ten per set and writes `levels.js` and
  `tools/level-table.md`. About 11 minutes for 90 candidates per set. `--pick` re-chooses from `tools/lab-out.json` without
  simulating; `--only=tplA,tplB` re-measures just those templates. To keep a hand-made level through a lab run, add it to `HAND`.
- `tools/level-table.md` the measurements for the kept levels
- `tools/play-check.mjs` loads the game in headless Chromium and checks: no errors or outside requests, no scroll and nothing
  cut off at 360x640, 390x844, 412x915 and desktop, every level stands still, can be cleared and is not a gift, the near miss
  screen and the Again button work, a real drag aims and fires, set buttons lock and open, and old or damaged saves load.
  `--quick` for fewer samples, `--levels=3,17` for some levels only. Screenshots go to `screens/`.

## Tuning knobs (top of `game.js`)
Ball speed range, gravity, material weights and grip, glass and TNT thresholds, blast size, settle timing.
None of these changed in this step; ice was added as a new material beside them.
After any change run the play-check; the table shows how often random play clears each level.
