import assert from "node:assert/strict";
import {
  BATTLE_GOLD,
  BUN_COST,
  BUN_HP,
  PACE_ESTIMATE,
  RECRUIT_COST,
  benchAlly,
  buyBun,
  chooseMapBuild,
  createCampaign,
  encounterMode,
  equip,
  linked,
  loadRun,
  offerWager,
  offersFromSeed,
  OFFER_COST,
  REROLL_COST,
  rerollShop,
  rewardOffers,
  rollDrop,
  RUN_SAVE_KEY,
  saveRun,
  swapKit,
  settleTwist,
  settleWager,
  stageMapChoice,
  takeOffer,
  takeReward,
  WAGER_STAKE,
  recruit,
  recallAlly,
  returnFromBattle,
  routeRank,
  scaleFor,
  setAnswerMode,
  setDifficulty,
  startBattle,
  travel,
  typeDrop,
  fireBonus,
} from "./campaign.ts";
import { answerCast, chooseAction, clickTile, createBattle, presentStep, presentationDelay, previewAction, rangeKeys, turnOrder } from "./game.ts";

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
assert.deepEqual(carried.stash, ["ember", "flare", "band", "spear"]);
assert.equal(carried.favors.ember, "Warden");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.atk, 6);
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.def, 3);
carried = equip(carried, "ilya", "ember");
carried = equip(carried, "ilya", "band");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.ability, "ember");
assert.equal(carried.party.find((ally) => ally.id === "ilya")?.equip, "band");
assert.deepEqual(carried.stash, ["flare", "spear"]);
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
assert.equal(again.battle.units.find((unit) => unit.id === "ilya")?.atk, 7);
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
assert.equal(presentationDelay("enemy", true) < presentationDelay("enemy", false), true);
assert.equal(presentStep(held).spell?.outcome, "open");
assert.equal(presentStep(held).spell?.problem.prompt, prompt);
assert.equal(presentStep(held).spell?.problem.answer, oak.spell?.problem.answer);
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

const sameA = offersFromSeed(1, [], []);
const sameB = offersFromSeed(1, [], []);
assert.deepEqual(sameA, sameB);
assert.equal(sameA.length, 2);
assert.notDeepEqual(sameA, offersFromSeed(2, [], []));
const poorRoll = rerollShop({ ...createCampaign(), gold: 0 });
assert.equal(poorRoll.gold, 0);
assert.equal(poorRoll.offers.length, 0);
const rolled = rerollShop({ ...createCampaign(), gold: 5 });
assert.equal(rolled.gold, 4);
assert.equal(rolled.seed, 1);
assert.deepEqual(rolled.offers, offersFromSeed(1, [], []));
assert.equal(REROLL_COST, 1);

let bench = takeOffer(
  {
    ...createCampaign(),
    gold: 4,
    offers: [{ kind: "kit", kit: "ember", favor: "Sorceress" }],
  },
  0,
);
assert.equal(bench.gold, 2);
assert.equal(OFFER_COST, 2);
assert.deepEqual(bench.stash, ["ember"]);
assert.equal(bench.favors.ember, "Sorceress");
assert.equal(takeOffer({ ...createCampaign(), gold: 1, offers: [{ kind: "kit", kit: "ember", favor: "Scout" }] }, 0).gold, 1);
bench = equip(bench, "ilya", "ember");
assert.equal(bench.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(bench.party.find((ally) => ally.id === "ilya")?.ability, "ember");
bench = stageMapChoice({
  ...bench,
  progression: { xp: 4, level: 0, taken: [], pending: [] },
});
assert.equal(bench.progression.xp, 0);
assert.equal(bench.progression.pending.length, 3);
bench = chooseMapBuild(bench, "focused-strike");
assert.ok(bench.progression.taken.includes("focused-strike"));
assert.equal(bench.party.find((ally) => ally.id === "ilya")?.atk, 6);
const nextFight = startBattle(bench);
assert.equal(nextFight.units.find((unit) => unit.id === "ilya")?.ability, "ember");
assert.equal(nextFight.units.find((unit) => unit.id === "ilya")?.atk, 7);
assert.ok(nextFight.progression.taken.includes("focused-strike"));

assert.equal(encounterMode("meadow", 4), encounterMode("meadow", 4));
const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => encounterMode("glen", seed)));
assert.ok(seen.size >= 2);
const revealed = travel(createCampaign(), "glen");
assert.equal(revealed.kind, "map");
if (revealed.kind !== "map") throw new Error("glen");
assert.equal(revealed.campaign.modes.glen, encounterMode("glen", 0));
const againGlen = travel({ ...revealed.campaign, nodeId: "camp" }, "glen");
assert.equal(againGlen.kind, "map");
if (againGlen.kind !== "map") throw new Error("glen again");
assert.equal(againGlen.campaign.modes.glen, revealed.campaign.modes.glen);

const pile = {
  ...createCampaign(),
  nodeId: "glen",
  modes: { glen: "pile" as const },
  twist: {
    nodeId: "glen",
    problem: { kind: "count" as const, prompt: "● ●", caption: "How many?", answer: 2, choices: [2, 1, 0, 3] },
    outcome: "open" as const,
  },
};
const pileMiss = settleTwist(pile, 99);
assert.equal(pileMiss.gold, 0);
assert.notEqual(pileMiss.gold, 99);
assert.equal(pileMiss.twist?.outcome, "fizzle");
const pileHit = settleTwist(pile, 2);
assert.equal(pileHit.gold, 2);
assert.equal(pileHit.twist?.outcome, "hit");

const oneDown = startBattle(createCampaign());
const victory = {
  ...oneDown,
  phase: "victory" as const,
  winner: "player" as const,
  units: oneDown.units.map((unit) => (unit.id === "ash" ? { ...unit, hp: 0 } : unit)),
};
const plainGold = returnFromBattle({ ...createCampaign(), nodeId: "meadow" }, victory, () => 0);
const twinGold = returnFromBattle({ ...createCampaign(), nodeId: "meadow", modes: { meadow: "twin" } }, victory, () => 0);
assert.equal(plainGold.gold, BATTLE_GOLD);
assert.equal(twinGold.gold, BATTLE_GOLD * 2);
const extraDrop = returnFromBattle({ ...createCampaign(), nodeId: "meadow", modes: { meadow: "extra" } }, victory, () => 0);
assert.ok(extraDrop.stash.length > plainGold.stash.length);

assert.equal(rollDrop(() => 0, [], [])?.ability, "flare");
let flare = equip({ ...createCampaign(), stash: ["flare"], favors: { flare: "Sorceress" }, gold: 5, nodeId: "town" }, "ilya", "flare");
assert.equal(flare.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(flare.party.find((ally) => ally.id === "ilya")?.ability, "flare");
flare = buyBun(flare);
assert.equal(flare.bunBought, true);
const flareFight = startBattle(flare);
assert.equal(flareFight.units.find((unit) => unit.id === "ilya")?.ability, "flare");
let flareCast = {
  ...flareFight,
  units: flareFight.units.map((unit) => (unit.id === "ash" ? { ...unit, col: 1, row: 5 } : unit)),
};
flareCast = clickTile(flareCast, 1, 6);
flareCast = chooseAction(flareCast, "flare");
assert.equal(flareCast.spell?.kind, "flare");
assert.equal(flareCast.spell?.outcome, "open");
const flarePrompt = flareCast.spell?.problem.prompt ?? "";
assert.equal(presentStep(flareCast).spell?.problem.prompt, flarePrompt);
const flareHit = answerCast(flareCast, flareCast.spell?.problem.answer ?? -1);
assert.equal(flareHit.spell?.damage, flareCast.spell?.problem.answer);
assert.notEqual(flareHit.spell?.damage, 99);
const back = returnFromBattle(flare, { ...flareFight, phase: "victory", winner: "player" }, () => 0);
assert.equal(back.bunBought, true);
assert.equal(back.party.find((ally) => ally.id === "ilya")?.ability, "flare");
assert.equal(startBattle(back).units.find((unit) => unit.id === "ilya")?.ability, "flare");

const sameRewards = rewardOffers(3, "meadow", []);
assert.deepEqual(sameRewards, rewardOffers(3, "meadow", []));
assert.ok(sameRewards.length === 2 || sameRewards.length === 3);
const otherRewards = rewardOffers(9, "glen", []);
assert.ok(otherRewards.length === 2 || otherRewards.length === 3);
const rewardKinds = new Set([...sameRewards, ...otherRewards].map((offer) => offer.kind));
assert.ok(rewardKinds.has("weapon") || rewardKinds.has("ability") || rewardKinds.has("class"));
assert.ok(rewardKinds.size >= 2);

const picked = takeReward(
  {
    ...createCampaign(),
    rewards: [
      { kind: "ability", kit: "ember", favor: "Sorceress" },
      { kind: "class", role: "Scout", favor: "Scout" },
      { kind: "weapon", kit: "spear", favor: "Warden" },
    ],
  },
  0,
  "ilya",
);
assert.equal(picked.rewards.length, 0);
assert.deepEqual(picked.stash, ["ember"]);
assert.equal(picked.favors.ember, "Sorceress");
const worn = equip(picked, "ilya", "ember");
assert.equal(worn.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(worn.party.find((ally) => ally.id === "ilya")?.ability, "ember");
assert.equal(startBattle(worn).units.find((unit) => unit.id === "ilya")?.ability, "ember");
const classed = takeReward(
  { ...worn, rewards: [{ kind: "class", role: "Scout", favor: "Scout" }] },
  0,
  "ilya",
);
assert.equal(classed.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(classed.party.find((ally) => ally.id === "ilya")?.secondary, "Scout");
assert.equal(classed.party.find((ally) => ally.id === "ilya")?.ability, "ember");

let run = stageMapChoice({
  ...createCampaign(),
  nodeId: "town",
  gold: 5,
  cleared: ["meadow"],
  progression: { xp: 4, level: 0, taken: [], pending: [] },
});
run = chooseMapBuild(run, "focused-strike");
run = buyBun(run);
run = equip({ ...run, stash: ["ember"], favors: { ember: "Sorceress" } }, "ilya", "ember");
const raw = saveRun(run, true);
const loaded = loadRun(raw);
assert.ok(loaded);
assert.equal(loaded?.fast, true);
assert.equal(loaded?.campaign.nodeId, "town");
assert.ok(loaded?.campaign.cleared.includes("meadow"));
assert.equal(loaded?.campaign.gold, run.gold);
assert.equal(loaded?.campaign.progression.level, run.progression.level);
assert.equal(loaded?.campaign.progression.xp, run.progression.xp);
assert.ok(loaded?.campaign.progression.taken.includes("focused-strike"));
assert.equal(loaded?.campaign.bunBought, true);
assert.equal(loaded?.campaign.party.find((ally) => ally.id === "ilya")?.ability, "ember");
assert.equal(buyBun(loaded?.campaign ?? run).gold, loaded?.campaign.gold);
const fresh = createCampaign();
assert.equal(fresh.gold, 0);
assert.equal(fresh.nodeId, "camp");
assert.equal(fresh.cleared.length, 0);
assert.equal(fresh.bunBought, false);
assert.equal(fresh.progression.level, 0);
assert.equal(fresh.party.find((ally) => ally.id === "ilya")?.ability, null);
assert.equal(loadRun("nope"), null);
const parsed = JSON.parse(raw) as { clock?: unknown; deadline?: unknown };
assert.equal("clock" in parsed, false);
assert.equal("deadline" in parsed, false);
assert.equal(RUN_SAVE_KEY, "tactical-survivors-run");

let swapped = equip({ ...createCampaign(), stash: ["ember"], favors: { ember: "Sorceress" } }, "ilya", "ember");
swapped = swapKit(swapped, "ilya", "penn", "ability");
assert.equal(swapped.party.find((ally) => ally.id === "ilya")?.ability, null);
assert.equal(swapped.party.find((ally) => ally.id === "penn")?.role, "Scout");
assert.equal(swapped.party.find((ally) => ally.id === "penn")?.ability, "ember");
swapped = swapKit(swapped, "penn", "ilya", "ability");
assert.equal(swapped.party.find((ally) => ally.id === "ilya")?.role, "Warden");
assert.equal(swapped.party.find((ally) => ally.id === "ilya")?.ability, "ember");
const benched = benchAlly({ ...swapped, gold: 3 }, "penn");
assert.equal(benched.gold, 2);
assert.equal(benched.party.find((ally) => ally.id === "penn")?.benched, true);
assert.equal(startBattle(benched).units.some((unit) => unit.id === "penn"), false);
assert.equal(startBattle(benched).units.find((unit) => unit.id === "ilya")?.ability, "ember");
const recalled = recallAlly(benched, "penn");
assert.equal(recalled.party.find((ally) => ally.id === "penn")?.benched, false);
assert.equal(recalled.gold, 1);
const keptRun = loadRun(saveRun(benched, true));
assert.equal(keptRun?.fast, true);
assert.equal(keptRun?.campaign.party.find((ally) => ally.id === "ilya")?.ability, "ember");
assert.equal(keptRun?.campaign.party.find((ally) => ally.id === "penn")?.benched, true);
assert.equal(keptRun?.campaign.progression.level, benched.progression.level);

const field = clickTile(createBattle(), 3, 6);
const hpBefore = field.units.map((unit) => unit.hp).join();
const spellBefore = field.spell;
const looked = previewAction(field, "bump");
assert.equal(field.spell, spellBefore);
assert.equal(field.units.map((unit) => unit.hp).join(), hpBefore);
assert.equal(looked, null);
const near = {
  ...createBattle(),
  units: createBattle().units.map((unit) => (unit.id === "vetch" ? { ...unit, col: 1, row: 5 } : unit.id === "ilya" ? { ...unit, ability: "ember" as const } : unit)),
};
const selected = clickTile(near, 1, 6);
const ranges = rangeKeys(selected);
assert.ok(ranges.move.length > 0);
assert.ok(ranges.attack.includes("1,5"));
assert.ok(ranges.ability.includes("1,5"));
const orderIds = turnOrder(selected).map((step) => step.id);
assert.equal(orderIds[0], "ilya");
assert.ok(orderIds.includes("vetch"));
const open = chooseAction(selected, "ember");
assert.equal(open.spell?.outcome, "open");
assert.equal(presentStep(open).spell?.outcome, "open");
assert.equal(presentStep(open).spell?.problem.prompt, open.spell?.problem.prompt);
assert.equal(presentStep(open).units.find((unit) => unit.id === "vetch")?.hp, open.units.find((unit) => unit.id === "vetch")?.hp);

assert.equal(routeRank("meadow"), 1);
assert.equal(routeRank("crown"), 8);
assert.equal(routeRank("camp"), 0);
assert.equal(scaleFor(1).hp, 0);
assert.equal(scaleFor(1).atk, 0);
assert.equal(scaleFor(8).hp, 14);
assert.equal(scaleFor(8).atk, 3);
assert.equal(linked("gate", "crown"), true);
assert.equal(linked("meadow", "ford"), true);
const steps = ["meadow", "ford", "briar", "mill", "hollow", "marsh", "kiln", "ridge", "orchard", "gate", "crown"];
let route = createCampaign();
for (const step of steps) {
  const moved = travel(route, step);
  assert.notEqual(moved.kind, "stay");
  route = moved.campaign;
}
assert.equal(route.nodeId, "crown");
const boss = startBattle(route);
assert.equal(boss.units.find((unit) => unit.id === "ash")?.name, "Cinderheart");
assert.ok((boss.units.find((unit) => unit.id === "ash")?.maxHp ?? 0) > 12);
const cleared = returnFromBattle(route, { ...boss, phase: "victory", winner: "player" }, () => 0);
assert.equal(cleared.summary, "victory");
assert.equal("clock" in cleared, false);
assert.notEqual(travel(cleared, "gate").kind, "stay");
const fallen = returnFromBattle(route, { ...boss, phase: "victory", winner: "enemy" });
assert.equal(fallen.summary, "defeat");
assert.notEqual(travel(fallen, "gate").kind, "stay");
assert.deepEqual(typeDrop("Brute", 4), typeDrop("Brute", 4));
assert.ok(typeDrop("Brute", 4).rarity === "common" || typeDrop("Brute", 4).rarity === "rare");
assert.equal(fireBonus({ role: "Warden", ability: "ember" }), 1);
assert.equal(fireBonus({ role: "Warden", ability: "flare" }), 1);
assert.equal(fireBonus({ role: "Scout", ability: "ember" }), 0);
const scout = equip({ ...createCampaign(), stash: ["ember"] }, "penn", "ember");
assert.equal(startBattle(scout).units.find((unit) => unit.id === "penn")?.atk, 4);
const warden = equip({ ...createCampaign(), stash: ["ember"] }, "ilya", "ember");
assert.equal(startBattle(warden).units.find((unit) => unit.id === "ilya")?.atk, 5);
const savedBoss = loadRun(saveRun(cleared, false));
assert.equal(savedBoss?.campaign.summary, "victory");
assert.equal(savedBoss?.campaign.nodeId, "crown");
assert.equal(createCampaign().summary, null);
assert.equal(createCampaign().found.length, 0);
assert.equal(createCampaign().nodeId, "camp");

console.log("map rewards ok");
