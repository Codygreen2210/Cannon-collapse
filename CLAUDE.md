# Cannon Collapse: rules for Claude

Phone browser physics game. Static site at the repo root: no build step, no server, no network calls at run time. Owner: Cody. He merges; work goes on a branch.

## Start here
- Read `notes/STATE.md` first, then `MAP.md`. Do not read whole big files: Grep or Read a range (`game.js` is about 560 lines, `tools/level-lab.mjs` about 360).
- After each finished step, add a few lines to `notes/STATE.md` (decisions, files touched, next step).

## What must not change without Cody saying so
- The feel that made the alpha work: cannon pull-back, ball speed, gravity, block weights, the near-miss flow ("So close. 1 block left." then "Again" in under 300 ms).
- No tracking, cookies, accounts, or requests to other sites. One tap to play.
- No gambling, no real-money prizes, nothing aimed at children.

## How to work
- Before saying anything is done, run the play check and paste its last line: start `python3 -m http.server 8765` (stop it by PID, never `pkill -f`), then `node tools/play-check.mjs http://localhost:8765`.
- Noisy commands go through `python3 tools/quiet.py "<command>"` so only failures and the tail come back.
- New or changed levels come from `tools/level-lab.mjs` (it writes `levels.js` and `tools/level-table.md`); hand-made levels go in its `HAND` list so a lab run keeps them.
- Any generated audio must pass `python3 tools/listen.py <file.wav> --out notes/` before it goes in (clipping, true peak over -1 dBTP, harshness fixed; ignore key and tempo for sound effects). Needs `pip install --break-system-packages soundfile scipy librosa pyloudnorm matplotlib`. Encode to mp3: `*.wav` is ignored.
- Chromium for Playwright is at `/opt/pw-browsers` in the cloud workspace; do not run `playwright install`.
- Small diffs when editing here. When Cody pastes by hand: full files, one at a time, open command first, wait for "done".
- Never the words "ship" or "shipping". Never delete anything in Vercel or other connected apps.

## Live
https://cannon-collapse.vercel.app (Vercel project `cannon-collapse`).
