# Play Ashfield

Amber moves first. The run is one battle that gets heavier each round. Clear the field after the last wave to hold Ashfield. If Amber falls, the host holds it.

`New battle` starts again from round 1.

## Controls

- Click an Amber fighter, then a highlighted tile to move.
- Click a foe in a red ring to strike. A strike is melee: you must stand on a tile next to the foe.
- If the move ends next to a foe, click that foe to strike, or click your fighter again to hold.
- Brush costs 2 movement. Stone blocks movement. Both stay in effect after a level-up.
- Hover a tile to see the move cost, the strike damage, and whether a foe can hit you there.
- `End turn` lets the host move. New foes do not act on the turn they arrive.

## Pressure

Reinforcements walk in at the start of your turn. Later waves are larger, then tougher. Round 5 is a crowd. Round 6 is the last wave, and those foes hit harder.

| Round | Who arrives |
| --- | --- |
| 1 | Opening three |
| 2 | 2 foes |
| 3 | 3 foes |
| 4 | 4 harder foes |
| 5 | A crowd of 8 |
| 6 | 4 tougher foes |

The board keeps a few empty tiles so the crowd cannot seal every step. A full field simply leaves the extras off.

These numbers live in `PRESSURE_DEFAULTS` in `src/pressure.ts`. A battle created with `pressure.enabled` set to false is the opening skirmish only.

## Progression

Amber shares one XP pool. A hit grants 1 XP. A kill grants 4 more. The first choice costs 4 XP, and each later choice costs 2 more.

Each choice is one of three offers, and a taken offer does not come back. Skills and items both change the fight:

- **Long stride** (skill): Amber move +1.
- **Brush cover** (skill): Amber standing in brush gains +2 defense. Brush still costs 2 move, so the tile is a choice, not a free bonus.
- **Focused strike** (skill): Amber attack +2.
- **Ward plate** (item): Amber defense +1 on every tile.
- **Field kit** (item): Amber max health +3, and each living fighter heals 3.

The turn waits until you pick. Defaults live in `PROGRESSION_DEFAULTS` in `src/progression.ts`.

## Models

The fighters already on the board keep their meshes. Reinforcements reuse those same meshes by role. A missing file stays a colored stand-in.

`public/assets/manifest.json` is the seam for art that is not here yet. `slots` starts empty. A later drop can map a unit id, or `role:Brute` and the other roles, to a file name under `/models/`. The value can be that file name, or `{ "file", "yaw", "rotation" }`. This file does not name a future set. If the manifest is missing, the current meshes stay.
