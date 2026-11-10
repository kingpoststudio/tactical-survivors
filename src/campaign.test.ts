import assert from "node:assert/strict";
import {
  BATTLE_GOLD,
  BUN_COST,
  BUN_HP,
  RECRUIT_COST,
  buyBun,
  createCampaign,
  recruit,
  returnFromBattle,
  setAnswerMode,
  setDifficulty,
  startBattle,
  travel,
} from "./campaign.ts";
import { createBattle } from "./game.ts";

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

console.log("map rewards ok");
