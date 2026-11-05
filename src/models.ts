export interface ModelSlot {
  file: string;
  /** Extra yaw in radians after the unit turns toward the other squad. */
  yaw?: number;
}

/**
 * Painted stills from the cute set. The matching GLBs are flat gray
 * (no texture, no vertex color), so the board uses these cutouts.
 * A missing file keeps the stand-in mesh.
 */
export const UNIT_MODELS: Record<string, ModelSlot> = {
  ilya: { file: "oak-warrior.png" },
  mora: { file: "lumen-sorceress.png" },
  penn: { file: "night-cap-batling.png" },
  ash: { file: "pebble-imp-boulder.png" },
  ruck: { file: "night-cap-moon-hat-goblin.png" },
  vetch: { file: "tide-sprite-wave-fin.png" },
};

export const TERRAIN_MODELS: Record<"tile" | "brush" | "stone", ModelSlot> = {
  tile: { file: "tile.glb" },
  brush: { file: "brush.glb" },
  stone: { file: "stone.glb" },
};

export interface ScenerySlot {
  file: string;
  kind: "unit" | "prop";
}

/** The rest of the cute set, stood around the grid. Not part of the skirmish. */
export const SCENERY: readonly ScenerySlot[] = [
  { file: "bramble-blob-sprout.png", kind: "unit" },
  { file: "bramble-blob-moss.png", kind: "unit" },
  { file: "bramble-blob-flower-crown.png", kind: "unit" },
  { file: "bramble-blob-thorny.png", kind: "unit" },
  { file: "pebble-imp-gravel.png", kind: "unit" },
  { file: "pebble-imp-geode.png", kind: "unit" },
  { file: "pebble-imp-mossy.png", kind: "unit" },
  { file: "ember-wisplet-spark.png", kind: "unit" },
  { file: "ember-wisplet-campfire.png", kind: "unit" },
  { file: "ember-wisplet-lava-drop.png", kind: "unit" },
  { file: "ember-wisplet-phoenix-chick.png", kind: "unit" },
  { file: "tide-sprite-tadpole.png", kind: "unit" },
  { file: "tide-sprite-shellback.png", kind: "unit" },
  { file: "tide-sprite-jelly-cap.png", kind: "unit" },
  { file: "night-cap-owlet.png", kind: "unit" },
  { file: "night-cap-star-moth.png", kind: "unit" },
  { file: "oak-sword.png", kind: "prop" },
  { file: "oak-bow-arrow.png", kind: "prop" },
  { file: "oak-boomerang.png", kind: "prop" },
  { file: "oak-spear.png", kind: "prop" },
  { file: "oak-shield.png", kind: "prop" },
  { file: "lumen-staff.png", kind: "prop" },
  { file: "lumen-wand.png", kind: "prop" },
  { file: "lumen-orb.png", kind: "prop" },
  { file: "lumen-spellbook.png", kind: "prop" },
  { file: "lumen-crystal.png", kind: "prop" },
];

export function modelUrl(file: string): string {
  return `/models/${file}`;
}
