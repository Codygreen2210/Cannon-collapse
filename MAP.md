# Repo map

| Path | What it is |
|---|---|
| `index.html`, `style.css` | The page: top bar, set buttons, canvas, result panel. Scripts load in this order: matter, levels, materials, fx, draw, game |
| `game.js` | Physics (matter-js), aiming, shots, settle and judge, stars, sound playing, saved progress, main loop, `window.__cc` test hook. Physics numbers are in `MAT`, `BALL` and the constants at the top. `onCollide` decides breaks (physics) and then calls `struck` / `damage` (looks and sound only, skipped when headless) |
| `materials.js` | One table, `CC.MATERIALS`, keyed by material name: how the block is painted, its hit and break sounds, its damage mark and what flies off it. Also the cached block pictures (`CC.tex`) and the crack marks kept on a block. A new material = one entry here + physics numbers in `game.js` |
| `fx.js` | `CC.fx`: the particle pool (fixed at 160, oldest dropped, nothing allocated per frame), dust, smoke, sparks, chips, glass shards, TNT blast, screen shake, the one slow moment per shot, cannon kick and muzzle flash, reduced-motion switch |
| `draw.js` | `CC.draw(G)`: backdrop, platform, blocks, cannon, ball and trail, aim arc, text on the field. Reads the game, never changes it |
| `levels.js` | 40 levels as plain data in four sets (Timber, Glass and powder, Ice, Balance). Block types are documented at the top |
| `vendor/matter.min.js` | matter-js 0.20.0, MIT licence beside it |
| `sfx/` | Thirteen effects as mp3 (72 KB) and the listen report |
| `tools/play-check.mjs` | Headless browser check of every level and screen size, plus the effects checks (frame cost, particle cap, slow moment, shake, reduced motion). Run before calling anything done |
| `tools/physics-check.mjs`, `tools/physics-baseline.json` | Proof that looks and sound work did not move the physics: fixed attempts on all 40 levels compared with the saved baseline, and two levels re-measured against the lab |
| `tools/shots.mjs` | Takes pictures of exact moments (muzzle flash, hits, shatter, TNT, collapse) into `screens/` using the hook's `freeze()` and `advance()` |
| `tools/big-tower.mjs` | A 14-block tower with every material, used by the two tools above. Not a level in the game |
| `tools/level-lab.mjs` | Generates candidate levels, plays them headless, keeps the good ones, writes `levels.js` and `tools/level-table.md` |
| `tools/level-table.md`, `tools/lab-out.json` | Measurements for kept levels; raw lab output (`--pick` re-chooses from it) |
| `tools/make_sfx.py` | Makes the sound effects with numpy (`--mp3` encodes them into `sfx/`) |
| `tools/listen.py` | Audio check (copied from Claudes-choice `studio/senses/listen.py`) |
| `tools/quiet.py` | Runs a command and prints only failures and the tail |
| `notes/listen/` | What the audio check said about the joined effects file, before and after fixing |
| `notes/STATE.md` | Where things stand. Read first, keep current |
| `vercel.json` | Tells Vercel this is a plain static site |
