import { EMPTY_MANIFEST, resolveManifestSlot, type AssetManifest } from "./assets.ts";

export interface ModelSlot {
  file: string;
  /** Extra yaw in radians after the unit turns toward the other squad. */
  yaw?: number;
  /** Mesh rotation in radians, applied before fitting, so a mesh lying down stands up. */
  rotation?: readonly [number, number, number];
}

/**
 * Cute-set meshes in public/models. A missing file keeps the stand-in.
 * These GLBs carry no texture and no vertex color, so they read as gray clay.
 */
export const UNIT_MODELS: Record<string, ModelSlot> = {
  ilya: { file: "oak-warrior.glb" },
  mora: { file: "lumen-sorceress.glb" },
  penn: { file: "night-cap-batling.glb", rotation: [Math.PI / 2, 0, 0] },
  ash: { file: "pebble-imp-boulder.glb", rotation: [Math.PI / 2, 0, 0] },
  ruck: { file: "night-cap-moon-hat-goblin.glb" },
  vetch: { file: "tide-sprite-wave-fin.glb", rotation: [Math.PI / 2, 0, 0] },
};

export const TERRAIN_MODELS: Record<"tile" | "brush" | "stone", ModelSlot> = {
  tile: { file: "tile.glb" },
  brush: { file: "brush.glb" },
  stone: { file: "stone.glb" },
};

export interface ScenerySlot {
  file: string;
  kind: "unit" | "prop";
  /** Mesh rotation in radians, applied before fitting. Props keep their own stand-up. */
  rotation?: readonly [number, number, number];
}

/** The rest of the cute set, stood around the grid. Not part of the skirmish. */
export const SCENERY: readonly ScenerySlot[] = [
  { file: "bramble-blob-sprout.glb", kind: "unit" },
  { file: "bramble-blob-moss.glb", kind: "unit" },
  { file: "bramble-blob-flower-crown.glb", kind: "unit" },
  { file: "bramble-blob-thorny.glb", kind: "unit", rotation: [Math.PI / 2, 0, 0] },
  { file: "pebble-imp-gravel.glb", kind: "unit", rotation: [Math.PI / 2, 0, 0] },
  { file: "pebble-imp-geode.glb", kind: "unit", rotation: [Math.PI, 0, 0] },
  { file: "pebble-imp-mossy.glb", kind: "unit" },
  { file: "ember-wisplet-spark.glb", kind: "unit", rotation: [0, 0, -Math.PI / 2] },
  { file: "ember-wisplet-campfire.glb", kind: "unit", rotation: [0, 0, -Math.PI / 2] },
  { file: "ember-wisplet-lava-drop.glb", kind: "unit", rotation: [Math.PI / 2, 0, 0] },
  { file: "ember-wisplet-phoenix-chick.glb", kind: "unit" },
  { file: "tide-sprite-tadpole.glb", kind: "unit", rotation: [Math.PI / 2, 0, 0] },
  { file: "tide-sprite-shellback.glb", kind: "unit" },
  { file: "tide-sprite-jelly-cap.glb", kind: "unit", rotation: [Math.PI / 2, 0, 0] },
  { file: "night-cap-owlet.glb", kind: "unit" },
  // Antennae pointed down. This turn stands the moth on its feet.
  { file: "night-cap-star-moth.glb", kind: "unit", rotation: [-0.9571, -0.9909, 1.6117] },
  { file: "oak-sword.glb", kind: "prop" },
  { file: "oak-bow-arrow.glb", kind: "prop" },
  { file: "oak-boomerang.glb", kind: "prop" },
  { file: "oak-spear.glb", kind: "prop" },
  { file: "oak-shield.glb", kind: "prop" },
  { file: "lumen-staff.glb", kind: "prop" },
  { file: "lumen-wand.glb", kind: "prop" },
  { file: "lumen-orb.glb", kind: "prop" },
  { file: "lumen-spellbook.glb", kind: "prop" },
  { file: "lumen-crystal.glb", kind: "prop" },
];

/** Reinforcements reuse a mesh already on the board. The manifest can replace any of these. */
export const ROLE_MODELS: Record<string, ModelSlot> = {
  Warden: UNIT_MODELS.ilya,
  Sorceress: UNIT_MODELS.mora,
  Scout: UNIT_MODELS.penn,
  Brute: UNIT_MODELS.ash,
  Raider: UNIT_MODELS.ruck,
  Skirmisher: UNIT_MODELS.vetch,
};

export function modelUrl(file: string): string {
  return `/models/${file}`;
}

/**
 * Slot keys are the unit id, then `role:<Role>`.
 * A manifest hit wins. Otherwise the current mesh for that id or role is used.
 * No future filename is assumed here.
 */
export function modelForUnit(
  unit: { id: string; role: string },
  manifest: AssetManifest = EMPTY_MANIFEST,
): ModelSlot | undefined {
  const dropped = resolveManifestSlot(manifest, [unit.id, `role:${unit.role}`]);
  if (dropped) return { file: dropped.file, yaw: dropped.yaw, rotation: dropped.rotation };
  return UNIT_MODELS[unit.id] ?? ROLE_MODELS[unit.role];
}
