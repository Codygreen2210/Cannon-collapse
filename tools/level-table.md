# Level table (made by tools/level-lab.mjs, seed 7, 90 candidates per set plus the old levels)

How to read it: "1st shot clears" is the share of single random shots (angle 5 to 75 degrees, power 25 to 100%) that clear the level outright;
the limit is 12% (25% for a set's first level). "Random attempts win" and "end 1-2 left" are from 160 random full attempts with the level's shots;
"end 1-2 left" is the near miss rate (levels under 5% were thrown out, 15% or more preferred). "Best" is the fewest shots the search found;
shots given = best + 2 (at least 3, at most 5). Within a set, levels run from the most random wins to the fewest (ties: fewer best shots first); a set's first level is the gentlest of the
levels that show the new piece alone. No more than two levels from one template in a set.

## Per set

| Set | Candidates | Survived | Thrown out | Kept | 1st shot clears (range) | Near miss rate (range) | Kept at 15%+ near miss |
|---|---|---|---|---|---|---|---|
| Timber | 95 | 80 | 0 unstable, 9 unwinnable, 0 trivial, 6 no near miss | 10 | 0.0 to 8.0% | 15.6 to 45.0% | 10 |
| Glass and powder | 94 | 69 | 0 unstable, 7 unwinnable, 0 trivial, 18 no near miss | 10 | 0.0 to 5.3% | 21.3 to 55.0% | 10 |
| Ice | 120 | 91 | 0 unstable, 22 unwinnable, 0 trivial, 2 no near miss | 10 | 0.0 to 8.0% | 18.8 to 78.8% | 10 |
| Balance | 120 | 74 | 0 unstable, 35 unwinnable, 0 trivial, 4 no near miss | 10 | 0.0 to 6.0% | 16.3 to 93.8% | 10 |

## Kept levels

| Set | No. | Name | Template | Shots | Blocks | Drift in 3 s (px) | Best | 1st shot clears | Random attempts win | End 1-2 left |
|---|---|---|---|---|---|---|---|---|---|---|
| Timber | 1 | Stack | stack (by hand) | nnn | 3 | 0.15 | 1 | 8.0% | 15.0% | 28.7% |
| Timber | 2 | Wide base | widebase (by hand) | nnnn | 4 | 0.28 | 1 | 3.3% | 19.4% | 36.9% |
| Timber | 3 | Tall and thin | tall (by hand) | nnn | 5 | 0.44 | 1 | 5.3% | 11.3% | 38.8% |
| Timber | 4 | Crates | stack | nnnn | 5 | 0.44 | 1 | 0.0% | 9.4% | 45.0% |
| Timber | 5 | Stone on legs | table | nnnn | 4 | 0.06 | 2 | 1.3% | 6.3% | 35.0% |
| Timber | 6 | Two towers | twin | nnnn | 4 | 0.06 | 1 | 0.7% | 4.4% | 44.4% |
| Timber | 7 | Bridge | bridge | nnnn | 5 | 0.12 | 2 | 0.0% | 4.4% | 35.0% |
| Timber | 8 | The fort | fort | nnnn | 4 | 0.12 | 1 | 1.3% | 3.8% | 16.3% |
| Timber | 9 | Pyramid | pyramid | nnh | 6 | 0.16 | 1 | 0.7% | 3.1% | 20.0% |
| Timber | 10 | Steps | steps | nnh | 6 | 0.15 | 1 | 1.3% | 2.5% | 15.6% |
| Glass and powder | 1 | Glass | glassIntro | nnnn | 3 | 0.15 | 1 | 4.0% | 8.8% | 55.0% |
| Glass and powder | 2 | Glass legs | glasslegs (by hand) | nnh | 5 | 0.22 | 1 | 5.3% | 9.4% | 26.3% |
| Glass and powder | 3 | Under the table | tntunder | nnnn | 7 | 0.12 | 1 | 2.7% | 7.5% | 25.0% |
| Glass and powder | 4 | Layer cake | glasstower | nnnh | 5 | 0.44 | 1 | 0.7% | 6.9% | 46.3% |
| Glass and powder | 5 | Sandwich | glasstower | nnh | 4 | 0.28 | 1 | 1.3% | 6.9% | 37.5% |
| Glass and powder | 6 | Glass in the way | glasswall | nnnn | 4 | 0.15 | 1 | 0.0% | 6.3% | 31.3% |
| Glass and powder | 7 | Glass towers | glasstwin | nnh | 7 | 0.22 | 1 | 0.7% | 6.3% | 21.3% |
| Glass and powder | 8 | Top shelf | tnttop | nnnn | 4 | 0.18 | 2 | 0.0% | 4.4% | 41.3% |
| Glass and powder | 9 | Glass table | glasslegs | nnnh | 6 | 0.22 | 1 | 1.3% | 3.8% | 46.3% |
| Glass and powder | 10 | Hat | tnttop | nnnn | 4 | 0.18 | 2 | 0.0% | 1.9% | 44.4% |
| Ice | 1 | Ice | iceIntro | nnn | 2 | 0.06 | 1 | 8.0% | 21.3% | 78.8% |
| Ice | 2 | Ice cubes | icestack | nnnn | 4 | 0.28 | 1 | 0.7% | 7.5% | 52.5% |
| Ice | 3 | Cold stack | icestack | nnnn | 4 | 0.28 | 1 | 0.7% | 6.9% | 53.1% |
| Ice | 4 | Ice legs | icetable | nnh | 4 | 0.12 | 1 | 1.3% | 6.9% | 28.7% |
| Ice | 5 | Rink | icerow | nnnn | 4 | 0.06 | 1 | 1.3% | 4.4% | 20.6% |
| Ice | 6 | Sled | icebase | nnnh | 4 | 0.28 | 2 | 0.0% | 3.1% | 52.5% |
| Ice | 7 | Igloo | icepyr | nnnn | 6 | 0.16 | 2 | 1.3% | 3.1% | 18.8% |
| Ice | 8 | Ice floe | icebase | nnnn | 4 | 0.28 | 2 | 0.7% | 2.5% | 56.9% |
| Ice | 9 | Ice gate | icetwin | nnn | 6 | 0.23 | 1 | 0.0% | 1.9% | 23.1% |
| Ice | 10 | Half and half | halfice | nnnh | 4 | 0.15 | 2 | 0.0% | 0.0% | 35.6% |
| Balance | 1 | Seesaw | seesawIntro | nnnn | 2 | 0.27 | 1 | 0.0% | 6.3% | 93.8% |
| Balance | 2 | Tipping point | seesaw | nnh | 4 | 0.71 | 1 | 5.3% | 18.1% | 16.3% |
| Balance | 3 | Wrecking weight | ropeIntro | nnn | 3 | 0.15 | 1 | 6.0% | 15.0% | 30.6% |
| Balance | 4 | Demolition | wrecker | nnh | 4 | 0.43 | 1 | 2.7% | 9.4% | 35.6% |
| Balance | 5 | Plumb line | ropeIntro | nnn | 3 | 0.15 | 1 | 2.0% | 7.5% | 30.6% |
| Balance | 6 | Crane | wrecker | nnnn | 4 | 0.28 | 1 | 1.3% | 6.9% | 48.1% |
| Balance | 7 | Swing bridge | wreckerBridge | nnh | 5 | 0.12 | 1 | 4.7% | 5.6% | 26.9% |
| Balance | 8 | Battering ram | wreckerBridge | nnnn | 5 | 0.43 | 1 | 0.7% | 5.6% | 23.1% |
| Balance | 9 | Bell | bellTwin | nnh | 5 | 0.15 | 1 | 0.0% | 1.9% | 28.7% |
| Balance | 10 | Playground | seesaw | nnnh | 3 | 0.35 | 2 | 0.0% | 1.9% | 28.7% |
