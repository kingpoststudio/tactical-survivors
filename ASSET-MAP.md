# Cute set on the Ashfield board

Source folder: `C:\Users\stu\Documents\ComfyUI\output\rpg-cute-2026-10-26`.

Each board file is the mesh for that asset. The in-folder `approved/model.glb` matches `model.iso.simplified.glb`. Where that mesh still had a Hunyuan base plate, the file on the board is the plate-stripped copy at `C:\Users\stu\Code\3d-studio\public\rpg\<id>\model.glb`. The five already-clean assets are the same bytes. These GLBs have no texture and no vertex color, so they render as gray clay.

Fighter ids are unchanged. Roster names match the meshes. The ring around the grid is not part of the fight. Nothing in the set is a ground tile.

## On the field

| Source | Board file | Where it stands |
| --- | --- | --- |
| `001-oak-warrior/approved/model.glb` | `oak-warrior.glb` | Oak, Amber warden (slot `ilya`) |
| `002-lumen-sorceress/approved/model.glb` | `lumen-sorceress.glb` | Lumen, Amber sorceress (slot `mora`) |
| `029-night-cap-batling/approved/model.glb` | `night-cap-batling.glb` | Batling, Amber scout (slot `penn`) |
| `020-pebble-imp-boulder/approved/model.glb` | `pebble-imp-boulder.glb` | Boulder, host brute (slot `ash`) |
| `032-night-cap-moon-hat-goblin/approved/model.glb` | `night-cap-moon-hat-goblin.glb` | Moonhat, host raider (slot `ruck`) |
| `028-tide-sprite-wave-fin/approved/model.glb` | `tide-sprite-wave-fin.glb` | Wavefin, host skirmisher (slot `vetch`) |

## Around the board

`013-bramble-blob-sprout` → `bramble-blob-sprout.glb`
`014-bramble-blob-moss` → `bramble-blob-moss.glb`
`015-bramble-blob-flower-crown` → `bramble-blob-flower-crown.glb`
`016-bramble-blob-thorny` → `bramble-blob-thorny.glb`
`017-pebble-imp-gravel` → `pebble-imp-gravel.glb`
`018-pebble-imp-geode` → `pebble-imp-geode.glb`
`019-pebble-imp-mossy` → `pebble-imp-mossy.glb`
`021-ember-wisplet-spark` → `ember-wisplet-spark.glb`
`022-ember-wisplet-campfire` → `ember-wisplet-campfire.glb`
`023-ember-wisplet-lava-drop` → `ember-wisplet-lava-drop.glb`
`024-ember-wisplet-phoenix-chick` → `ember-wisplet-phoenix-chick.glb`
`025-tide-sprite-tadpole` → `tide-sprite-tadpole.glb`
`026-tide-sprite-shellback` → `tide-sprite-shellback.glb`
`027-tide-sprite-jelly-cap` → `tide-sprite-jelly-cap.glb`
`030-night-cap-owlet` → `night-cap-owlet.glb`
`031-night-cap-star-moth` → `night-cap-star-moth.glb`
`003-oak-sword` → `oak-sword.glb`
`004-oak-bow-arrow` → `oak-bow-arrow.glb`
`005-oak-boomerang` → `oak-boomerang.glb`
`006-oak-spear` → `oak-spear.glb`
`007-oak-shield` → `oak-shield.glb`
`008-lumen-staff` → `lumen-staff.glb`
`009-lumen-wand` → `lumen-wand.glb`
`010-lumen-orb` → `lumen-orb.glb`
`011-lumen-spellbook` → `lumen-spellbook.glb`
`012-lumen-crystal` → `lumen-crystal.glb`

## Skipped

- `model.glb` and `model_a1_00001_.glb` are the same raw mesh. `model.iso.glb` is the unsimplified twin. The board uses one mesh per asset.
- Stills, `pick.png`, prompts, `qa.json`, logs, and pid files. The mesh is on the board.
- No terrain mesh in the set. `tile.glb`, `brush.glb`, and `stone.glb` still replace the ground if you add them.

## Later art

`public/assets/manifest.json` is empty on purpose. A unit id or `role:<Role>` can point at a file under `/models/` when that file exists. Nothing in the manifest names a future set. A missing file keeps the stand-in, and the meshes above stay in use until a slot is filled.
