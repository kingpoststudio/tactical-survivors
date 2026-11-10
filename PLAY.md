# Play Ashfield

The path starts on a small map. Step from Camp to the Meadow, fight, then come back. The Shrine is the next step, then Town.

Lumen casts Spark. The answer to the problem is the damage. A wrong answer fizzles. It does not hit for the number you typed or tapped.

## Map

Camp, Meadow, Shrine, and Town sit on a line. You can step only to a neighbor.

- Meadow starts a short fight. Clearing it pays 5 gold.
- Shrine grants Brush cover: standing in brush adds 2 defense. Brush still costs 2 move.
- Town sells one Sweet bun for 2 gold (each ally +1 max health) and one recruit, Pip, for 3 gold.

A clear meadow pays enough for both.

## Spark

Select Lumen, move into range, then Cast. Click the foe if more than one is close enough.

- Choices: tap a number.
- Type: enter the exact number.
- Difficulty starts at counting and sums within 5. Sums and differences within 10 and 20, then a harder tier, are in the Difficulty menu.

The problem stays on screen until you continue. A hit deals that answer. A miss deals nothing.

## Battle

- Click an Amber fighter, then a highlighted tile to move.
- Click a foe in a red ring to strike. A strike is melee: stand on a tile next to the foe.
- If the move ends next to a foe, click that foe to strike, or click your fighter again to hold.
- Brush costs 2 movement. Stone blocks movement.
- Hover a tile to see the move cost, the strike damage, and whether a foe can hit you there.
- `End turn` lets the host move.

The meadow fight is the opening three foes. Win or lose, Map brings you back. Only a win pays gold.

## Pressure

`Pressure run` is the older rising-pressure battle. It is not the path the map starts on. Reinforcements still walk in from round 2, and round 6 is the last wave. `New battle` starts that run over. Those numbers live in `PRESSURE_DEFAULTS` in `src/pressure.ts`.

## Models

The fighters already on the board keep their meshes. Reinforcements reuse those same meshes by role. Pip, and any missing file, stays a colored stand-in.

`public/assets/manifest.json` is the seam for art that is not here yet. The Style menu previews one set at a time. Picking a set does not lock the game to that look.
