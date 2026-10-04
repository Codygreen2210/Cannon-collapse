# Repo map

| Path | What it is |
|---|---|
| `index.html`, `style.css` | The page: top bar, set buttons, canvas, result panel |
| `game.js` | Physics (matter-js), aiming, shots, settle and judge, stars, sound, drawing, saved progress, `window.__cc` test hook. `place()` fits the view to the screen; `NEED` is the stars needed to open a set |
| `levels.js` | 40 levels as plain data in four sets (Timber, Glass and powder, Ice, Balance). Block types are documented at the top |
| `vendor/matter.min.js` | matter-js 0.20.0, MIT licence beside it |
| `sfx/` | Seven effects as mp3 and the listen report |
| `tools/play-check.mjs` | Headless browser check of every level and screen size. Run before calling anything done |
| `tools/level-lab.mjs` | Generates candidate levels, plays them headless, keeps the good ones, writes `levels.js` and `tools/level-table.md` |
| `tools/level-table.md`, `tools/lab-out.json` | Measurements for kept levels; raw lab output (`--pick` re-chooses from it) |
| `tools/make_sfx.py` | Makes the sound effects with numpy |
| `tools/listen.py` | Audio check (copied from Claudes-choice `studio/senses/listen.py`) |
| `tools/quiet.py` | Runs a command and prints only failures and the tail |
| `notes/STATE.md` | Where things stand. Read first, keep current |
| `vercel.json` | Tells Vercel this is a plain static site |
