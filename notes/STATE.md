# State (keep this short; a fresh session starts here)

- Oct 4, 2026: Cannon Collapse came out of idea round 29 in Codygreen2210/Claudes-choice (mobile game trends). A rough 10-level version went live; Cody played it and called it "a really good rough alpha". He asked for it to have its own repo: this one.
- Same day: steps 1 and 2 of the plan done. 40 levels in four sets picked by the level lab from 429 candidates; view fitted to tall phones; TNT levels reworked; sets open at 15 stars. Play check passes (130 checks).
- Not yet judged by a person: the 30 new levels. Possible soft spots: late levels may be too hard (0 to 3% of random attempts win); the seesaw intro nearly always ends 1 or 2 blocks short; the 15-star gate is a guess.
- Live at https://cannon-collapse.vercel.app (Vercel project `cannon-collapse`).

## Plan Cody agreed to (in order; check it still feels good after each)
1. Feel fixes (done) 2. About 40 levels in themed sets (done) 3. Star map 4. Daily tower with a card to send a friend 5. Real art and better sound 6. Two or three more ball types 7. Getting it in front of people (home-screen install, CrazyGames listing, short clips)

## Next
Cody plays the 40 levels and says what is too hard, too easy or dull. Then step 3.

## Vercel (Oct 4)
- The live site now deploys from this repo's `main` (deployment made by hand through the Vercel connector). Root directory is the repo root.
- STILL TO DO BY CODY: the Vercel project's Git link still points at Codygreen2210/Claudes-choice, so pushes here do not deploy by themselves yet. In Vercel: project `cannon-collapse` > Settings > Git > disconnect, then connect Codygreen2210/cannon-collapse. Until then a guard (Ignored Build Step) skips any build that does not come from this repo, so a merge in Claudes-choice cannot overwrite the live game. After relinking, that guard can be cleared.

## Oct 4, 4:23pm: Cody's handoff (docs/handoff/)
- Cody sent a gameplay handoff and an "asset pack". The pack is ONE reference sheet (docs/handoff/art-direction-sheet.jpg), not sliced sprites: use it as art direction and draw the pieces in canvas code. Direction: "blueprint / construction site meets polished cartoon physics"; the fantasy is "figure out the one shot that makes everything collapse".
- His phase order (GAMEPLAY_HANDOFF.txt section 22): 1 polish the core (recoil, trail, impact effects, material destruction, camera shake, audio) / 2 puzzle depth (weak point, chain reactions, bank shots, challenges) / 3 progression (three-star scoring by efficiency, destruction, style; worlds; boss levels; cannon skins) / 4 art overhaul and HUD cleanup. This replaces the earlier 7-step plan above where they differ.
- Phase 1 in progress on branch `phase1-polish`. Looks and sound only: no change to weights, friction, ball speed, gravity or breakage rules.

## Oct 4, evening: phase 1 built on `phase1-polish` (not pushed, not merged; Cody has not played it yet)
- Looks and sound only. Physics proof: `node tools/physics-check.mjs` (40 of 40 levels identical to the baseline taken before the work; two levels re-measured equal to the lab table). Play check passes with 138 checks.
- Drawing moved out of game.js into draw.js; effects in fx.js; material looks and sounds in one table in materials.js. See MAP.md.
- Built: iron cannon on a wooden carriage with kick, flash and smoke; shaded ball with a tapering trail; sparks, chips, splinters, dust from real collisions; crack marks that stay on wood, glass and ice; glass shards; TNT ring and smoke; small shake (5 px at most, never while aiming); one slow moment per shot (TNT, or 3 blocks off inside half a second); reduced motion turns shake and slow motion off; 13 sounds (6 new) checked with listen.py.
- Kept as they were: the dotted aim arc, the last-shot arc, the short freeze on a hard hit, the slow-down near the end of a last shot and on a win. So a shot can still have the new slow moment and then the old win slow-down: Cody to say if that is too much.
- Not judged by ear: nobody has heard the new sounds on a phone. The low ones (cannon, stone, TNT, rumble) may be thin on a phone speaker.
- Not done: the top bar and shot icons still have the old look (that is his phase 4); the shot icons are white while the ball is now iron grey.
- Next: Cody plays the branch on his phone and says what feels right or wrong; then phase 2 (puzzle depth).
