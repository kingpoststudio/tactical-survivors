import assert from "node:assert/strict";
import {
  BATTLE_GOLD,
  BUN_COST,
  BUN_HP,
  PACE_ESTIMATE,
  RECRUIT_COST,
  buyBun,
  createCampaign,
  equip,
  linked,
  offerWager,
  rollDrop,
  settleWager,
  WAGER_STAKE,
  recruit,
  returnFromBattle,
  setAnswerMode,
  setDifficulty,
  startBattle,
  travel,
} from "./campaign.ts";
import { answerCast, chooseAction, clickTile, createBattle, presentStep, presentationDelay } from "./game.ts";

const camp = createCampaign();
assert.equal(camp.nodeId, "camp");
assert.equal(camp.gold, 0);
assert.equal(camp.difficulty, "within-5");
assert.equal(camp.answerMode, "choice");
assert.equal(camp.party.length, 3);
assert.equal(camp.party.find((ally) => ally.id === "mora")?.spell, true);

assert.equal(travel(camp, "town").kind, "stay");
assert.equal(travel(camp, "shrine").kind, "stay");
assert.equal(buyBun({ ...camp, gold: 5 }).gold, 5);
assert.equal(recruit({ ...camp, gold: 5 }).party.length, 3);

const tuned = setAnswerMode(setDifficulty(camp, "within-10"), "typed");
const opening = travel(tuned, "meadow");
assert.equal(opening.kind, "battle");
if (opening.kind !== "battle") throw new Error("meadow should start a battle");
assert.equal(opening.campaign.nodeId, "meadow");
assert.equal(opening.battle.pressure.enabled, false);
assert.equal(opening.battle.pressure.waves.length, 0);
assert.deepEqual(opening.battle.casters, ["mora"]);
assert.equal(opening.battle.difficulty, "within-10");
assert.equal(opening.battle.answerMode, "typed");
assert.equal(createBattle().pressure.enabled, true);

const lost = returnFromBattle(opening.campaign, { ...opening.battle, phase: "victory", winner: "enemy" });
assert.equal(lost.gold, 0);
assert.equal(lost.cleared.includes("meadow"), false);
assert.equal(lost.lastEvent.includes("No gold"), true);

const won = returnFromBattle(opening.campaign, { ...opening.battle, phase: "victory", winner: "player" });
assert.equal(won.gold, BATTLE_GOLD);
assert.equal(won.lastEvent, `Clear. 0 + ${BATTLE_GOLD} = ${BATTLE_GOLD}.`);
assert.ok(won.cleared.includes("meadow"));
assert.equal(returnFromBattle(opening.campaign, opening.battle).gold, 0);

assert.equal(travel(won, "town").kind, "stay");
const shrine = travel(won, "shrine");
assert.equal(shrine.kind, "map");
if (shrine.kind !== "map") throw new Error("shrine should stay on the map");
assert.equal(shrine.campaign.nodeId, "shrine");
assert.ok(shrine.campaign.progression.taken.includes("brush-cover"));
assert.equal(shrine.campaign.rewardClaimed, true);

const quiet = travel({ ...shrine.campaign, nodeId: "meadow" }, "shrine");
assert.equal(quiet.kind, "map");
if (quiet.kind !== "map") throw new Error("second shrine visit should stay on the map");
assert.equal(quiet.campaign.lastEvent, "The shrine is quiet.");
assert.equal(quiet.campaign.progression.taken.filter((id) => id === "brush-cover").length, 1);

const already = travel(
  {
    ...createCampaign(),
    nodeId: "meadow",
    progression: { ...createCampaign().progression, taken: ["brush-cover"] },
  },
  "shrine",
);
assert.equal(already.kind, "map");
if (already.kind !== "map") throw new Error("covered shrine should stay on the map");
assert.equal(already.campaign.gold, 2);
assert.equal(already.campaign.progression.taken.filter((id) => id === "brush-cover").length, 1);

const town = travel(shrine.campaign, "town");
assert.equal(town.kind, "map");
if (town.kind !== "map") throw new Error("town should stay on the map");
assert.equal(town.campaign.nodeId, "town");
assert.equal(town.campaign.gold, BATTLE_GOLD);

const poor = buyBun({ ...town.campaign, gold: 1 });
assert.equal(poor.gold, 1);
assert.equal(poor.bunBought, false);

const bought = buyBun(town.campaign);
assert.equal(bought.gold, BATTLE_GOLD - BUN_COST);
assert.equal(bought.bunBought, true);
assert.equal(bought.lastEvent, `Sweet bun. ${BATTLE_GOLD} − ${BUN_COST} = ${BATTLE_GOLD - BUN_COST}.`);
for (const ally of town.campaign.party) {
  const next = bought.party.find((item) => item.id === ally.id);
  assert.equal(next?.maxHp, ally.maxHp + BUN_HP);
  assert.equal(next?.hp, ally.hp + BUN_HP);
}
const twice = buyBun(bought);
assert.equal(twice.gold, bought.gold);
assert.equal(twice.party[0]?.maxHp, bought.party[0]?.maxHp);

const short = recruit({ ...town.campaign, gold: 2 });
assert.equal(short.party.some((ally) => ally.id === "pip"), false);

const hired = recruit(bought);
assert.equal(hired.gold, BATTLE_GOLD - BUN_COST - RECRUIT_COST);
assert.equal(hired.recruited, true);
assert.equal(hired.party.find((ally) => ally.id === "pip")?.name, "Pip");
assert.equal(recruit(hired).gold, hired.gold);
assert.equal(hired.party.filter((ally) => ally.id === "pip").length, 1);

const backToShrine = travel(hired, "shrine");
assert.equal(backToShrine.kind, "map");
if (backToShrine.kind !== "map") throw new Error("return to shrine should stay on the map");
const rematch = travel(backToShrine.campaign, "meadow");
assert.equal(rematch.kind, "battle");
if (rematch.kind !== "battle") throw new Error("meadow should start the rematch");
assert.equal(rematch.battle.pressure.enabled, false);
assert.ok(rematch.battle.units.some((unit) => unit.id === "pip" && unit.side === "player"));
assert.ok(rematch.battle.progression.taken.includes("brush-cover"));
assert.equal(rematch.battle.units.find((unit) => unit.id === "mora")?.maxHp, 10);
assert.equal(startBattle(hired).casters.includes("mora"), true);

assert.equal(linked("camp", "meadow"), true);
assert.equal(linked("camp", "glen"), true);
assert.equal(linked("camp", "town"), false);
const glenChoice = travel(camp, "glen");
assert.equal(glenChoice.kind, "map");
if (glenChoice.kind !== "map") throw new Error("glen should stay on the map");
assert.equal(glenChoice.campaign.nodeId, "glen");
assert.equal(travel(camp, "meadow").kind, "battle");
assert.equal(PACE_ESTIMATE.activeFightMinutes, 5);
assert.equal(PACE_ESTIMATE.fightsPerRun, 8);

let carried = createCampaign();
let fought = startBattle(carried);
fought = {
  ...fought,
  phase: "victory",
  winner: "player",
  progression: { xp: 1, level: 1, taken: ["long-stride"], pending: [] },
  units: fought.units.map((unit) => (unit.side === "enemy" ? { ...unit, hp: 0 } : unit)),
};
carried = returnFromBattle(carried, fought, () => 0);
assert.equal(carried.progression.level, 1);
assert.deepEqual(carried.progression.taken, ["long-stride", "brush-cover", "focused-strike", "ward-plate"]);
assert.deepEqual(carried.stash, ["ember", "band", "spear"]);
assert.equal(carried.favors.ember, "Warden");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.atk, 6);
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.def, 3);
carried = equip(carried, "ilya", "ember");
carried = equip(carried, "ilya", "band");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.ability, "ember");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.equip, "band");
assert.deepEqual(carried.stash, ["spear"]);
carried = buyBun({ ...carried, nodeId: "town", gold: 5 });
assert.equal(carried.bunBought, true);
assert.equal(carried.gold, 3);
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.maxHp, 13);
const setup = travel(carried, "glen");
assert.equal(setup.kind, "map");
if (setup.kind !== "map") throw new Error("town should reach glen");
const again = travel(setup.campaign, "meadow");
assert.equal(again.kind, "battle");
if (again.kind !== "battle") throw new Error("glen should reach the meadow");
assert.equal(again.campaign.bunBought, true);
assert.equal(again.campaign.gold, 3);
assert.equal(again.battle.progression.level, 1);
assert.deepEqual(again.battle.progression.taken, ["long-stride", "brush-cover", "focused-strike", "ward-plate"]);
assert.equal(again.battle.units.find((unit) => unit.id === "ilya")?.ability, "ember");
assert.equal(again.battle.units.find((unit) => unit.id === "ilya")?.def, 4);
assert.equal(again.battle.units.find((unit) => unit.id === "ilya")?.atk, 6);
assert.equal(again.battle.units.find((unit) => unit.id === "mora")?.maxHp, 10);

let oak = again.battle;
oak = {
  ...oak,
  units: oak.units.map((unit) => (unit.id === "ash" ? { ...unit, col: 1, row: 5 } : unit)),
};
oak = clickTile(oak, 1, 6);
oak = chooseAction(oak, "ember");
assert.equal(oak.spell?.kind, "ember");
assert.equal(oak.spell?.casterId, "ilya");
assert.equal(oak.spell?.outcome, "open");
const prompt = oak.spell?.problem.prompt ?? "";
assert.ok(prompt.length > 0);
const held = presentStep(oak);
assert.equal(held.spell?.outcome, "open");
assert.equal(held.spell?.problem.prompt, prompt);
assert.equal(presentationDelay("walk", true) < presentationDelay("walk", false), true);
assert.equal(presentStep(held).spell?.outcome, "open");
const cast = answerCast(oak, oak.spell?.problem.answer ?? -1);
assert.equal(cast.spell?.outcome, "hit");
assert.equal(cast.spell?.damage, oak.spell?.problem.answer);
assert.notEqual(cast.spell?.damage, 99);

const kept = returnFromBattle(again.campaign, { ...again.battle, phase: "victory", winner: "enemy" });
assert.equal(kept.gold, again.campaign.gold);
assert.equal(kept.bunBought, true);
assert.equal(kept.progression.level, 1);
assert.equal(kept.party.find((ally) => ally.id === "ilya")?.ability, "ember");

const first = rollDrop(() => 0, [], []);
const second = rollDrop(() => 0.9, [], []);
assert.ok(first && second);
assert.equal(first?.weapon, "ember");
assert.equal(first?.favor, "Warden");
assert.equal(first?.build, "long-stride");
assert.equal(second?.weapon, "spear");
assert.equal(second?.favor, "Scout");
assert.notEqual(first?.weapon, second?.weapon);
assert.notEqual(first?.favor, second?.favor);

const cross = equip(
  { ...createCampaign(), stash: ["ember"], favors: { ember: "Sorceress" } },
  "ilya",
  "ember",
);
assert.equal(cross.favors.ember, "Sorceress");
assert.equal(cross.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(cross.party.find((ally) => ally.id === "ilya")?.ability, "ember");
assert.equal(startBattle(cross).units.find((unit) => unit.id === "ilya")?.ability, "ember");

const broke = offerWager({ ...createCampaign(), nodeId: "town", gold: 1 }, () => 0);
assert.equal(broke.wager, null);
assert.equal(broke.gold, 1);
const table = offerWager({ ...createCampaign(), nodeId: "town", gold: 5 }, () => 0);
assert.equal(table.wager?.stake, WAGER_STAKE);
assert.equal(table.wager?.problem.answer, 1);
assert.equal(table.gold, 5);
const miss = settleWager(table, 99);
assert.equal(miss.gold, 3);
assert.notEqual(miss.gold, 5 - WAGER_STAKE + 99);
assert.equal(miss.wager?.outcome, "lost");
const hit = settleWager(table, 1);
assert.equal(hit.gold, 7);
assert.equal(hit.wager?.outcome, "won");

console.log("map rewards ok");
