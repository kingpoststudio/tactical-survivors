# Cute set on the Ashfield board

Source folder: `C:\Users\stu\Documents\ComfyUI\output\rpg-cute-2026-10-26`.

The GLBs in that folder are one flat gray material: no texture and no vertex color. The board uses the painted still instead, cut out and stood up as a billboard. Fighter ids are unchanged so the skirmish rules stay put. The names on the roster are the characters in the pictures.

## On the field

| Source file | Board file | Where it stands |
| --- | --- | --- |
| `001-oak-warrior/pick.png` | `oak-warrior.png` | Oak, Amber warden (slot `ilya`) |
| `002-lumen-sorceress/pick.png` | `lumen-sorceress.png` | Lumen, Amber sorceress (slot `mora`) |
| `029-night-cap-batling/pick.png` | `night-cap-batling.png` | Batling, Amber scout (slot `penn`) |
| `020-pebble-imp-boulder/pick.png` | `pebble-imp-boulder.png` | Boulder, host brute (slot `ash`) |
| `032-night-cap-moon-hat-goblin/pick.png` | `night-cap-moon-hat-goblin.png` | Moonhat, host raider (slot `ruck`) |
| `028-tide-sprite-wave-fin/still-02-realistic.png` | `tide-sprite-wave-fin.png` | Wavefin, host skirmisher (slot `vetch`) |

`approved/pick.png` matches `pick.png` for these. The wave-fin pick is a frog; the realistic still is the finned fish.

## Around the board

Reserve creatures, then weapon props, in a ring. They are not fighters.

| Source file | Board file |
| --- | --- |
| `013-bramble-blob-sprout/still-02-realistic.png` | `bramble-blob-sprout.png` |
| `014-bramble-blob-moss/pick.png` | `bramble-blob-moss.png` |
| `015-bramble-blob-flower-crown/pick-alt.png` | `bramble-blob-flower-crown.png` |
| `016-bramble-blob-thorny/pick.png` | `bramble-blob-thorny.png` |
| `017-pebble-imp-gravel/pick.png` | `pebble-imp-gravel.png` |
| `018-pebble-imp-geode/still-02-realistic.png` | `pebble-imp-geode.png` |
| `019-pebble-imp-mossy/still-02-realistic.png` | `pebble-imp-mossy.png` |
| `021-ember-wisplet-spark/still-02-realistic.png` | `ember-wisplet-spark.png` |
| `022-ember-wisplet-campfire/still-01-realistic.png` | `ember-wisplet-campfire.png` |
| `023-ember-wisplet-lava-drop/pick.png` | `ember-wisplet-lava-drop.png` |
| `024-ember-wisplet-phoenix-chick/pick.png` | `ember-wisplet-phoenix-chick.png` |
| `025-tide-sprite-tadpole/pick.png` | `tide-sprite-tadpole.png` |
| `026-tide-sprite-shellback/pick.png` | `tide-sprite-shellback.png` |
| `027-tide-sprite-jelly-cap/pick.png` | `tide-sprite-jelly-cap.png` |
| `030-night-cap-owlet/pick.png` | `night-cap-owlet.png` |
| `031-night-cap-star-moth/pick.png` | `night-cap-star-moth.png` |
| `003-oak-sword/still-01-realistic.png` | `oak-sword.png` |
| `004-oak-bow-arrow/still-01-realistic.png` | `oak-bow-arrow.png` |
| `005-oak-boomerang/still-02-realistic.png` | `oak-boomerang.png` |
| `006-oak-spear/still-02-realistic.png` | `oak-spear.png` |
| `007-oak-shield/still-02-realistic.png` | `oak-shield.png` |
| `008-lumen-staff/still-02-realistic.png` | `lumen-staff.png` |
| `009-lumen-wand/pick.png` | `lumen-wand.png` |
| `010-lumen-orb/still-02-realistic.png` | `lumen-orb.png` |
| `011-lumen-spellbook/pick.png` | `lumen-spellbook.png` |
| `012-lumen-crystal/still-01-realistic.png` | `lumen-crystal.png` |

There is no ground, brush, or stone picture in the set. Tiles stay the built-in blocks. `tile.glb`, `brush.glb`, and `stone.glb` still replace them if you add those files.

## Skipped

- Every `model.glb`, `model.iso.glb`, `model.iso.simplified.glb`, `model_a1_00001_.glb`, and `approved/model.glb`. Flat gray, duplicate meshes of each other. `model.glb` matches `model_a1_00001_.glb`. `approved/model.glb` matches `model.iso.simplified.glb`.
- Stills that show a hand, a camera, a scale figure, or a second rejected take. The file used above is the clean read of that prop or creature.
- `pick.png` when a different still in the same folder is the one on the board. `approved/pick.png` is the same bytes as `pick.png`.
- `*.txt`, `qa.json`, `DONE.txt`, `manifest.csv`, `STATUS.md`, `STYLE-LOCK.md`, `driver.log`, `launch*.log`, and the pid files. Pipeline notes, not pictures.
