import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { playFight, playIdle } from "./autoplay.ts";
import { parseAssetManifest } from "./assets.ts";
import { living } from "./game.ts";
import { modelForUnit } from "./models.ts";

const fight = playFight();
const idle = playIdle();
console.log("FIGHT");
for (const line of fight.events) console.log(line);
console.log("IDLE");
for (const line of idle.events) console.log(line);

assert.equal(fight.state.phase, "victory");
assert.equal(fight.state.winner, "enemy");
assert.ok(fight.state.round >= 6);
assert.ok(fight.state.spawnedRounds.includes(5));
assert.ok(fight.state.spawnedRounds.includes(6));
assert.ok(fight.events.some((line) => line.includes("crowd")));
assert.equal(living(fight.state.units).some((unit) => unit.side === "player"), false);
assert.ok(living(fight.state.units).some((unit) => unit.side === "enemy"));

assert.equal(idle.state.phase, "victory");
assert.equal(idle.state.winner, "enemy");
assert.equal(idle.state.round, 4);
assert.equal(living(idle.state.units).some((unit) => unit.side === "player"), false);
assert.equal(living(idle.state.units).filter((unit) => unit.side === "enemy").length, 12);

const manifest = parseAssetManifest(JSON.parse(readFileSync("public/assets/manifest.json", "utf8")));
assert.equal(manifest.activeStyle, "");
assert.equal(Object.keys(manifest.slots).length, 0);
const styles = manifest.styles ?? {};
assert.deepEqual(Object.keys(styles).sort(), [
  "arcane-clockwork",
  "bioluminescent-alien",
  "gothic-occult",
  "lowpoly-dark-fantasy",
  "woodland-folklore",
]);
assert.equal(Object.keys(styles["woodland-folklore"].slots).length, 0);
let files = 0;
for (const style of Object.values(styles)) {
  for (const slot of Object.values(style.slots)) {
    files += 1;
    assert.equal(slot.file.endsWith(".lod15k.glb"), true);
    assert.equal(existsSync(`public/models/${slot.file}`), true);
    assert.equal(slot.file.includes("model.glb"), false);
  }
}
assert.equal(files, 14);
const preview = { ...manifest, activeStyle: "lowpoly-dark-fantasy" };
assert.equal(
  modelForUnit({ id: "ilya", role: "Warden" }, preview).file,
  "styles/lowpoly-dark-fantasy/01-player-vanguard-tank.lod15k.glb",
);
assert.equal(modelForUnit({ id: "penn", role: "Scout" }, preview).file, "night-cap-batling.glb");
assert.equal(modelForUnit({ id: "ilya", role: "Warden" }, { ...manifest, activeStyle: "woodland-folklore" }).file, "oak-warrior.glb");
assert.equal(modelForUnit({ id: "ilya", role: "Warden" }, manifest).file, "oak-warrior.glb");

console.log(
  `playthrough ok fight ${fight.actions} acts round ${fight.state.round} foes ${living(fight.state.units).length}; idle ${idle.actions} acts round ${idle.state.round}`,
);
