import assert from "node:assert/strict";
import { parseAssetManifest } from "./assets.ts";
import {
  beginEnemy,
  chooseBuild,
  clickTile,
  createBattle,
  living,
  scriptedStep,
  stepEnemy,
  strikeDamage,
  TERRAIN,
  winnerOf,
  withCrowd,
  type Unit,
} from "./game.ts";
import { modelForUnit } from "./models.ts";
import {
  foeStats,
  planReinforcements,
  PRESSURE_DEFAULTS,
  spawnCount,
  waveForRound,
} from "./pressure.ts";
import { BUILD_POOL, freshProgression, offersFor, PROGRESSION_DEFAULTS, xpCostForNext } from "./progression.ts";

const crowd = waveForRound(5);
assert.ok(crowd);
assert.equal(crowd.crowd, true);
assert.equal(crowd.count, 8);

const early = waveForRound(2);
const mid = waveForRound(4);
assert.ok(early && mid);
assert.ok(mid.count > early.count);
assert.ok(crowd.count > mid.count);
assert.equal(waveForRound(2, { ...PRESSURE_DEFAULTS, enabled: false }), null);

const skirmish = foeStats(0, 1);
const harder = foeStats(0, 2);
const elite = foeStats(0, 3);
assert.equal(skirmish.role, "Skirmisher");
assert.ok(harder.maxHp > skirmish.maxHp);
assert.ok(harder.atk > skirmish.atk);
assert.ok(elite.maxHp > harder.maxHp);
assert.ok(elite.def > harder.def);
assert.equal(foeStats(1, 1).role, "Raider");
assert.equal(foeStats(2, 1).role, "Brute");

assert.equal(spawnCount(45, 8), 8);
assert.equal(spawnCount(10, 8), 6);
assert.equal(spawnCount(3, 8), 2);
assert.equal(spawnCount(1, 8), 0);

const battle = createBattle();
const placed = planReinforcements({
  round: 5,
  occupied: battle.units.map((unit) => ({ col: unit.col, row: unit.row })),
  terrain: TERRAIN,
});
assert.equal(placed.length, 8);
const spots = new Set(placed.map((foe) => `${foe.col},${foe.row}`));
assert.equal(spots.size, placed.length);
for (const foe of placed) {
  assert.notEqual(TERRAIN[foe.row][foe.col], "stone");
  assert.equal(battle.units.some((unit) => unit.hp > 0 && unit.col === foe.col && unit.row === foe.row), false);
  assert.equal(foe.tier, 2);
}

const tight = planReinforcements({
  round: 5,
  occupied: [{ col: 0, row: 0 }],
  terrain: [
    ["plain", "stone"],
    ["plain", "plain"],
    ["plain", "plain"],
  ],
});
assert.equal(tight.length, 3);
assert.deepEqual(
  tight.map((foe) => [foe.col, foe.row]),
  [
    [0, 1],
    [1, 1],
    [0, 2],
  ],
);

let game = createBattle();
game = beginEnemy(game);
let guard = 0;
while (game.phase === "enemy" && guard < 20) {
  game = stepEnemy(game);
  guard += 1;
}
assert.equal(game.round, 2);
assert.equal(game.phase, "player");
assert.equal(living(game.units).filter((unit) => unit.side === "enemy").length, 5);
assert.equal(living(game.units).filter((unit) => unit.tier === 1).length, 2);

game = createBattle();
game.units = game.units.map((unit) => (unit.side === "enemy" ? { ...unit, hp: 0 } : unit));
assert.equal(winnerOf(game), null);
const last = Math.max(...game.pressure.waves.map((wave) => wave.round));
game = { ...game, round: last, spawnedRounds: [last] };
assert.equal(winnerOf(game), "player");

const skirmishOnly = createBattle({ pressure: { ...PRESSURE_DEFAULTS, enabled: false } });
assert.equal(
  winnerOf({ ...skirmishOnly, units: skirmishOnly.units.map((unit) => (unit.side === "enemy" ? { ...unit, hp: 0 } : unit)) }),
  "player",
);

const quiet = createBattle({ progression: { ...PROGRESSION_DEFAULTS, enabled: false } });
let muted = quiet;
muted.units = muted.units.map((unit) => (unit.id === "vetch" ? { ...unit, col: 6, row: 5, hp: 1 } : unit));
muted = clickTile(muted, 6, 6);
muted = clickTile(muted, 6, 5);
assert.equal(muted.units.find((unit) => unit.id === "vetch")?.hp, 0);
assert.equal(muted.phase === "level", false);
assert.equal(muted.progression.pending.length, 0);

let xp = createBattle();
xp.units = xp.units.map((unit) => (unit.id === "vetch" ? { ...unit, col: 6, row: 5, hp: 1 } : unit));
xp = clickTile(xp, 6, 6);
xp = clickTile(xp, 6, 5);
assert.equal(xp.phase, "level");
assert.equal(xp.progression.pending.length, 3);
assert.deepEqual(
  xp.progression.pending.map((offer) => offer.id),
  ["long-stride", "brush-cover", "focused-strike"],
);
assert.equal(xp.progression.xp, 1);
assert.equal(xpCostForNext(0), 4);

const before = xp.units.find((unit) => unit.id === "penn");
assert.ok(before);
xp = chooseBuild(xp, "long-stride");
const after = xp.units.find((unit) => unit.id === "penn");
assert.equal(after?.mov, before.mov + 1);
assert.deepEqual(xp.progression.taken, ["long-stride"]);
assert.equal(xp.phase === "level", false);
assert.equal(clickTile(xp, 0, 0).phase === "level", false);

function offer(id: (typeof BUILD_POOL)[number]["id"]) {
  const found = BUILD_POOL.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
}

let strike = createBattle();
strike.progression = { ...freshProgression(), pending: [offer("focused-strike")] };
strike.phase = "level";
const oak = strike.units.find((unit) => unit.id === "ilya");
assert.ok(oak);
strike = chooseBuild(strike, "focused-strike");
assert.equal(strike.units.find((unit) => unit.id === "ilya")?.atk, oak.atk + 2);

let plate = createBattle();
plate.progression = { ...freshProgression(), pending: [offer("ward-plate")] };
plate.phase = "level";
plate = chooseBuild(plate, "ward-plate");
assert.equal(plate.units.find((unit) => unit.id === "ilya")?.def, oak.def + 1);

let kit = createBattle();
kit.units = kit.units.map((unit) => (unit.id === "penn" ? { ...unit, hp: 4 } : unit));
kit.progression = { ...freshProgression(), pending: [offer("field-kit")] };
kit.phase = "level";
kit = chooseBuild(kit, "field-kit");
const healed = kit.units.find((unit) => unit.id === "penn");
assert.equal(healed?.maxHp, 10);
assert.equal(healed?.hp, 7);

const nextOffers = offersFor(1, ["long-stride"]);
assert.equal(nextOffers.some((offer) => offer.id === "long-stride"), false);
assert.equal(nextOffers.length, 3);
assert.equal(new Set(nextOffers.map((offer) => offer.id)).size, 3);
assert.equal(offersFor(4, BUILD_POOL.map((offer) => offer.id)).length, 0);

const coverDefender: Unit = {
  id: "oak",
  name: "Oak",
  role: "Warden",
  side: "player",
  col: 1,
  row: 3,
  hp: 8,
  maxHp: 8,
  atk: 4,
  def: 1,
  mov: 3,
  acted: false,
};
const hitter: Unit = {
  id: "foe",
  name: "Foe",
  role: "Raider",
  side: "enemy",
  col: 1,
  row: 2,
  hp: 8,
  maxHp: 8,
  atk: 4,
  def: 0,
  mov: 4,
  acted: false,
};
assert.equal(TERRAIN[3][1], "brush");
assert.equal(strikeDamage(hitter, coverDefender, [], 2), 3);
assert.equal(strikeDamage(hitter, coverDefender, ["brush-cover"], 2), 1);
assert.equal(strikeDamage(hitter, { ...coverDefender, col: 0 }, ["brush-cover"], 2), 3);
assert.equal(strikeDamage({ ...hitter, atk: 2 }, { ...coverDefender, def: 6 }, ["brush-cover"], 2), 1);

const packed = withCrowd(createBattle());
const foes = living(packed.units).filter((unit) => unit.side === "enemy");
assert.ok(foes.length >= 11);
assert.equal(packed.round, 5);
assert.equal(packed.phase, "player");
const started = performance.now();
let crowdTurn = beginEnemy(packed);
let steps = 0;
while (crowdTurn.phase === "enemy" && steps < 40) {
  crowdTurn = stepEnemy(crowdTurn);
  steps += 1;
}
const elapsed = performance.now() - started;
assert.ok(steps >= 8);
assert.ok(elapsed < 500, `crowd enemy turn took ${elapsed.toFixed(1)}ms`);
assert.equal(crowdTurn.phase === "enemy", false);

const played = scriptedStep(packed);
assert.ok(played.lastEvent.length > 0);
assert.equal(living(played.units).filter((unit) => unit.side === "enemy").length >= 8, true);

const manifest = parseAssetManifest({
  version: 1,
  slots: {
    nope: "",
    bad: 3,
    ilya: "oak-warrior.glb",
    "role:Brute": { file: "pebble-imp-boulder.glb", rotation: [1, 0, 0] },
  },
});
assert.equal(manifest.slots.nope, undefined);
assert.equal(manifest.slots.ilya.file, "oak-warrior.glb");
assert.equal(modelForUnit({ id: "ilya", role: "Warden" }).file, "oak-warrior.glb");
assert.equal(modelForUnit({ id: "foe-r5-1", role: "Brute" }).file, "pebble-imp-boulder.glb");
assert.equal(modelForUnit({ id: "foe-r5-1", role: "Brute" }, manifest).rotation?.[0], 1);
assert.equal(modelForUnit({ id: "ilya", role: "Warden" }, manifest).file, "oak-warrior.glb");
assert.equal(parseAssetManifest(null).slots && Object.keys(parseAssetManifest(null).slots).length, 0);

console.log(`ashfield run ok (${elapsed.toFixed(1)}ms crowd turn)`);
