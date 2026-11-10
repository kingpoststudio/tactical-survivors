import { BUILD_POOL, acceptBuild, freshProgression, offersFor, xpCostForNext, type BuildId, type ProgressionState } from "./progression.ts";
import { createBattle, openingRoster, type GameState, type Unit } from "./game.ts";
import { gradeAnswer, makeProblem, type AnswerMode, type Difficulty, type MathProblem } from "./mathcast.ts";

export const BATTLE_GOLD = 5;
export const BUN_COST = 2;
export const BUN_HP = 1;
export const RECRUIT_COST = 3;
export const REWARD_GOLD = 2;

/**
 * Pacing estimates only. They are not rules, and there is no clock.
 * A fight is about 5 minutes of active play. A run is about 8 fights.
 * Shops and setup take as long as the player wants. Wall time is not capped.
 */
export const PACE_ESTIMATE = { activeFightMinutes: 5, fightsPerRun: 8 } as const;

export type NodeKind = "camp" | "battle" | "reward" | "town" | "setup";
export type KitId = "ember" | "band" | "spear";
export const CLASS_OUTCOMES = ["Warden", "Sorceress", "Scout"] as const;
export type ClassOutcome = (typeof CLASS_OUTCOMES)[number];
export const WEAPON_OUTCOMES: readonly KitId[] = ["ember", "band", "spear"];
export const WAGER_STAKE = 2;
export const REROLL_COST = 1;
export const OFFER_COST = 2;

export interface WorldNode {
  id: string;
  name: string;
  kind: NodeKind;
  links: readonly string[];
}

export const WORLD: readonly WorldNode[] = [
  { id: "camp", name: "Camp", kind: "camp", links: ["meadow", "glen"] },
  { id: "meadow", name: "Meadow", kind: "battle", links: ["camp", "shrine", "glen"] },
  { id: "glen", name: "Glen", kind: "setup", links: ["camp", "meadow", "town"] },
  { id: "shrine", name: "Shrine", kind: "reward", links: ["meadow", "town"] },
  { id: "town", name: "Town", kind: "town", links: ["shrine", "glen"] },
];

/** A kit may favor a class. Any ally can still wear it. */
export const KITS: Record<KitId, { name: string; favors: ClassOutcome; slot: "ability" | "equip" }> = {
  ember: { name: "Ember", favors: "Sorceress", slot: "ability" },
  band: { name: "Band", favors: "Warden", slot: "equip" },
  spear: { name: "Spear", favors: "Scout", slot: "equip" },
};

export interface Ally {
  id: string;
  name: string;
  role: string;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  mov: number;
  col: number;
  row: number;
  spell: boolean;
  ability: "ember" | null;
  equip: "band" | "spear" | null;
}

export interface DropRoll {
  weapon: KitId | null;
  favor: ClassOutcome;
  build: BuildId | null;
}

export interface Wager {
  stake: number;
  problem: MathProblem;
  outcome: "open" | "won" | "lost";
}

export type ShopOffer =
  | { kind: "kit"; kit: KitId; favor: ClassOutcome }
  | { kind: "build"; build: BuildId; favor: ClassOutcome };

export interface Campaign {
  nodeId: string;
  gold: number;
  party: Ally[];
  progression: ProgressionState;
  rewardClaimed: boolean;
  bunBought: boolean;
  recruited: boolean;
  cleared: string[];
  difficulty: Difficulty;
  answerMode: AnswerMode;
  lastEvent: string;
  stash: KitId[];
  /** Rolled class for a kit. It does not block equipping. */
  favors: Partial<Record<KitId, ClassOutcome>>;
  /** A stake of game gold. Never real money. */
  wager: Wager | null;
  seed: number;
  offers: ShopOffer[];
}

export type TravelResult =
  | { kind: "stay"; campaign: Campaign }
  | { kind: "map"; campaign: Campaign }
  | { kind: "battle"; campaign: Campaign; battle: GameState };

export function nodeById(id: string): WorldNode {
  const node = WORLD.find((item) => item.id === id);
  if (!node) throw new Error(`Unknown map node ${id}.`);
  return node;
}

export function linked(from: string, to: string): boolean {
  return nodeById(from).links.includes(to);
}

function allyFrom(unit: Unit, spell: boolean): Ally {
  return {
    id: unit.id,
    name: unit.name,
    role: unit.role,
    maxHp: unit.maxHp,
    hp: unit.hp,
    atk: unit.atk,
    def: unit.def,
    mov: unit.mov,
    col: unit.col,
    row: unit.row,
    spell,
    ability: null,
    equip: null,
  };
}

function pip(): Ally {
  return {
    id: "pip",
    name: "Pip",
    role: "Friend",
    maxHp: 6,
    hp: 6,
    atk: 3,
    def: 0,
    mov: 4,
    col: 4,
    row: 6,
    spell: false,
    ability: null,
    equip: null,
  };
}

export function createCampaign(): Campaign {
  const party = openingRoster()
    .filter((unit) => unit.side === "player")
    .map((unit) => allyFrom(unit, unit.id === "mora"));
  return {
    nodeId: "camp",
    gold: 0,
    party,
    progression: freshProgression(),
    rewardClaimed: false,
    bunBought: false,
    recruited: false,
    cleared: [],
    difficulty: "within-5",
    answerMode: "choice",
    lastEvent: "Camp.",
    stash: [],
    favors: {},
    wager: null,
    seed: 0,
    offers: [],
  };
}

export function setDifficulty(campaign: Campaign, difficulty: Difficulty): Campaign {
  if (campaign.difficulty === difficulty) return campaign;
  return { ...campaign, difficulty };
}

export function setAnswerMode(campaign: Campaign, answerMode: AnswerMode): Campaign {
  if (campaign.answerMode === answerMode) return campaign;
  return { ...campaign, answerMode };
}

function toUnit(ally: Ally): Unit {
  return {
    id: ally.id,
    name: ally.name,
    role: ally.role,
    side: "player",
    col: ally.col,
    row: ally.row,
    hp: ally.hp,
    maxHp: ally.maxHp,
    atk: ally.atk + (ally.equip === "spear" ? 1 : 0),
    def: ally.def + (ally.equip === "band" ? 1 : 0),
    mov: ally.mov,
    acted: false,
    ability: ally.ability,
  };
}

export function startBattle(campaign: Campaign): GameState {
  const enemies = openingRoster().filter((unit) => unit.side === "enemy");
  const allies = campaign.party.filter((ally) => ally.hp > 0).map(toUnit);
  return createBattle({
    pressure: { enabled: false, waves: [] },
    units: [...allies, ...enemies],
    casters: campaign.party.filter((ally) => ally.spell && ally.hp > 0).map((ally) => ally.id),
    difficulty: campaign.difficulty,
    answerMode: campaign.answerMode,
    progressionState: campaign.progression,
  });
}

function claimReward(campaign: Campaign): Campaign {
  if (campaign.rewardClaimed) return { ...campaign, lastEvent: "The shrine is quiet." };
  if (campaign.progression.taken.includes("brush-cover")) {
    const gold = campaign.gold + REWARD_GOLD;
    return {
      ...campaign,
      rewardClaimed: true,
      gold,
      lastEvent: `The shrine is quiet. ${campaign.gold} + ${REWARD_GOLD} = ${gold}.`,
    };
  }
  const taken: BuildId[] = [...campaign.progression.taken, "brush-cover"];
  return {
    ...campaign,
    rewardClaimed: true,
    progression: { ...campaign.progression, taken },
    lastEvent: "Brush cover. In brush, defense is higher.",
  };
}

export function travel(campaign: Campaign, nodeId: string): TravelResult {
  if (!linked(campaign.nodeId, nodeId)) return { kind: "stay", campaign };
  const node = nodeById(nodeId);
  let next: Campaign = { ...campaign, nodeId };
  if (node.kind === "reward") next = claimReward(next);
  if (node.kind === "battle") {
    return { kind: "battle", campaign: { ...next, lastEvent: "A fight starts." }, battle: startBattle(next) };
  }
  if (node.kind === "town") next = { ...next, lastEvent: "Town." };
  if (node.kind === "camp") next = { ...next, lastEvent: "Camp." };
  if (node.kind === "setup") next = { ...next, lastEvent: "Glen." };
  return { kind: "map", campaign: next };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/** One defeated monster. The class, weapon, and build are a roll, not a fixed path. */
export function rollDrop(rng: () => number, owned: readonly KitId[], taken: readonly BuildId[]): DropRoll | null {
  const weapons = WEAPON_OUTCOMES.filter((id) => !owned.includes(id));
  const builds = BUILD_POOL.map((offer) => offer.id).filter((id) => !taken.includes(id));
  if (weapons.length === 0 && builds.length === 0) return null;
  return {
    weapon: weapons.length > 0 ? pick(weapons, rng) : null,
    favor: pick(CLASS_OUTCOMES, rng),
    build: builds.length > 0 ? pick(builds, rng) : null,
  };
}

export function collectDrops(
  defeated: number,
  owned: readonly KitId[],
  taken: readonly BuildId[],
  rng: () => number,
): { kits: KitId[]; favors: Partial<Record<KitId, ClassOutcome>>; builds: BuildId[] } {
  const have = [...owned];
  const known = [...taken];
  const kits: KitId[] = [];
  const favors: Partial<Record<KitId, ClassOutcome>> = {};
  const builds: BuildId[] = [];
  for (let index = 0; index < defeated; index++) {
    const drop = rollDrop(rng, have, known);
    if (!drop) break;
    if (drop.weapon && !have.includes(drop.weapon)) {
      kits.push(drop.weapon);
      have.push(drop.weapon);
      favors[drop.weapon] = drop.favor;
    }
    if (drop.build && !known.includes(drop.build)) {
      builds.push(drop.build);
      known.push(drop.build);
    }
  }
  return { kits, favors, builds };
}

function ownedKits(campaign: Campaign): KitId[] {
  const kits = [...campaign.stash];
  for (const ally of campaign.party) {
    if (ally.ability) kits.push(ally.ability);
    if (ally.equip) kits.push(ally.equip);
  }
  return kits;
}

export function equip(campaign: Campaign, allyId: string, kit: KitId): Campaign {
  if (!campaign.stash.includes(kit)) return campaign;
  const ally = campaign.party.find((item) => item.id === allyId);
  if (!ally || ally.hp <= 0) return campaign;
  const slot = KITS[kit].slot;
  const previous = slot === "ability" ? ally.ability : ally.equip;
  const stash = campaign.stash.filter((id) => id !== kit);
  if (previous) stash.push(previous);
  const party = campaign.party.map((item) => {
    if (item.id !== allyId) return item;
    if (slot === "ability") return { ...item, ability: "ember" as const };
    return { ...item, equip: kit === "spear" ? ("spear" as const) : ("band" as const) };
  });
  return { ...campaign, stash, party };
}

function applyAllyBuild(party: readonly Ally[], id: BuildId): Ally[] {
  return party.map((ally) => {
    if (ally.hp <= 0) return ally;
    if (id === "long-stride") return { ...ally, mov: ally.mov + 1 };
    if (id === "focused-strike") return { ...ally, atk: ally.atk + 2 };
    if (id === "ward-plate") return { ...ally, def: ally.def + 1 };
    if (id === "field-kit") return { ...ally, maxHp: ally.maxHp + 3, hp: ally.hp + 3 };
    return ally;
  });
}

function restored(party: readonly Ally[], units: readonly Unit[]): Ally[] {
  return party.map((ally) => {
    const unit = units.find((item) => item.id === ally.id);
    if (!unit) return { ...ally, hp: ally.maxHp };
    const band = ally.equip === "band" ? 1 : 0;
    const spear = ally.equip === "spear" ? 1 : 0;
    return {
      ...ally,
      maxHp: unit.maxHp,
      hp: unit.maxHp,
      atk: unit.atk - spear,
      def: unit.def - band,
      mov: unit.mov,
    };
  });
}

export function returnFromBattle(campaign: Campaign, battle: GameState, rng: () => number = Math.random): Campaign {
  if (battle.phase !== "victory") return campaign;
  const defeated = battle.units.filter((unit) => unit.side === "enemy" && unit.hp <= 0).length;
  const dropped = collectDrops(defeated, ownedKits(campaign), battle.progression.taken, rng);
  let party = battle.winner === "player" ? restored(campaign.party, battle.units) : campaign.party;
  for (const id of dropped.builds) party = applyAllyBuild(party, id);
  const carried: Campaign = {
    ...campaign,
    stash: [...campaign.stash, ...dropped.kits],
    favors: { ...campaign.favors, ...dropped.favors },
    party,
    progression: {
      xp: battle.progression.xp,
      level: battle.progression.level,
      taken: [...battle.progression.taken, ...dropped.builds],
      pending: [],
    },
  };
  if (battle.winner !== "player") return { ...carried, lastEvent: "The meadow holds. No gold." };
  const gold = campaign.gold + BATTLE_GOLD;
  const cleared = campaign.cleared.includes(campaign.nodeId) ? campaign.cleared : [...campaign.cleared, campaign.nodeId];
  return {
    ...carried,
    gold,
    cleared,
    lastEvent: `Clear. ${campaign.gold} + ${BATTLE_GOLD} = ${gold}.`,
  };
}

/** Stake game gold on a math problem. A wrong answer spends the stake and never pays the typed number. */
export function offerWager(campaign: Campaign, rng: () => number = Math.random): Campaign {
  if (campaign.nodeId !== "town" || campaign.wager?.outcome === "open" || campaign.gold < WAGER_STAKE) return campaign;
  return {
    ...campaign,
    wager: { stake: WAGER_STAKE, problem: makeProblem(campaign.difficulty, rng), outcome: "open" },
  };
}

export function settleWager(campaign: Campaign, given: number): Campaign {
  const wager = campaign.wager;
  if (!wager || wager.outcome !== "open" || campaign.gold < wager.stake) return campaign;
  const grade = gradeAnswer(wager.problem, given);
  if (!grade) return campaign;
  const spent = campaign.gold - wager.stake;
  if (!grade.correct) {
    return {
      ...campaign,
      gold: spent,
      wager: { ...wager, outcome: "lost" },
      lastEvent: `${campaign.gold} − ${wager.stake} = ${spent}.`,
    };
  }
  const payout = wager.stake + wager.stake;
  const gold = spent + payout;
  return {
    ...campaign,
    gold,
    wager: { ...wager, outcome: "won" },
    lastEvent: `${spent} + ${payout} = ${gold}.`,
  };
}

export function buyBun(campaign: Campaign): Campaign {
  if (campaign.nodeId !== "town" || campaign.bunBought || campaign.gold < BUN_COST) return campaign;
  const gold = campaign.gold - BUN_COST;
  return {
    ...campaign,
    gold,
    bunBought: true,
    party: campaign.party.map((ally) =>
      ally.hp <= 0
        ? ally
        : { ...ally, maxHp: ally.maxHp + BUN_HP, hp: Math.min(ally.maxHp + BUN_HP, ally.hp + BUN_HP) },
    ),
    lastEvent: `Sweet bun. ${campaign.gold} − ${BUN_COST} = ${gold}.`,
  };
}

export function recruit(campaign: Campaign): Campaign {
  if (campaign.nodeId !== "town" || campaign.recruited || campaign.gold < RECRUIT_COST) return campaign;
  if (campaign.party.some((ally) => ally.id === "pip")) return campaign;
  const gold = campaign.gold - RECRUIT_COST;
  return {
    ...campaign,
    gold,
    recruited: true,
    party: [...campaign.party, pip()],
    lastEvent: `Pip joins. ${campaign.gold} − ${RECRUIT_COST} = ${gold}.`,
  };
}

function mixSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two shop offers from a seed. Same seed, same offers. */
export function offersFromSeed(seed: number, owned: readonly KitId[], taken: readonly BuildId[]): ShopOffer[] {
  const rng = mixSeed(seed);
  const pool: ShopOffer[] = [
    ...WEAPON_OUTCOMES.filter((kit) => !owned.includes(kit)).map((kit) => ({ kind: "kit" as const, kit, favor: "Warden" as const })),
    ...BUILD_POOL.filter((offer) => !taken.includes(offer.id)).map((offer) => ({
      kind: "build" as const,
      build: offer.id,
      favor: "Warden" as const,
    })),
  ];
  const bag = [...pool];
  const picked: ShopOffer[] = [];
  for (let count = 0; count < 2 && bag.length > 0; count++) {
    const index = Math.floor(rng() * bag.length);
    const favor = CLASS_OUTCOMES[Math.floor(rng() * CLASS_OUTCOMES.length)];
    const item = bag.splice(index, 1)[0];
    picked.push({ ...item, favor });
  }
  return picked;
}

/** Spend 1 gold to draw a new pair of offers. No clock. */
export function rerollShop(campaign: Campaign): Campaign {
  if (campaign.gold < REROLL_COST) return campaign;
  const seed = (campaign.seed + 1) >>> 0;
  const gold = campaign.gold - REROLL_COST;
  return {
    ...campaign,
    gold,
    seed,
    offers: offersFromSeed(seed, ownedKits(campaign), campaign.progression.taken),
    lastEvent: `${campaign.gold} − ${REROLL_COST} = ${gold}.`,
  };
}

/** Spend 2 gold to take one offer into the stash or the build. */
export function takeOffer(campaign: Campaign, index: number): Campaign {
  const offer = campaign.offers[index];
  if (!offer || campaign.gold < OFFER_COST) return campaign;
  const owned = ownedKits(campaign);
  if (offer.kind === "kit" && owned.includes(offer.kit)) return campaign;
  if (offer.kind === "build" && campaign.progression.taken.includes(offer.build)) return campaign;
  const gold = campaign.gold - OFFER_COST;
  const offers = campaign.offers.filter((_, item) => item !== index);
  if (offer.kind === "kit") {
    return {
      ...campaign,
      gold,
      offers,
      stash: [...campaign.stash, offer.kit],
      favors: { ...campaign.favors, [offer.kit]: offer.favor },
      lastEvent: `${campaign.gold} − ${OFFER_COST} = ${gold}.`,
    };
  }
  return {
    ...campaign,
    gold,
    offers,
    party: applyAllyBuild(campaign.party, offer.build),
    progression: { ...campaign.progression, taken: [...campaign.progression.taken, offer.build] },
    lastEvent: `${campaign.gold} − ${OFFER_COST} = ${gold}.`,
  };
}

/** If the banked XP can open a choice, put it on the map. It does not start a fight. */
export function stageMapChoice(campaign: Campaign): Campaign {
  if (campaign.progression.pending.length > 0) return campaign;
  const cost = xpCostForNext(campaign.progression.level);
  if (campaign.progression.xp < cost) return campaign;
  const pending = offersFor(campaign.progression.level, campaign.progression.taken);
  if (pending.length === 0) return campaign;
  return {
    ...campaign,
    progression: { ...campaign.progression, xp: campaign.progression.xp - cost, pending },
  };
}

export function chooseMapBuild(campaign: Campaign, id: BuildId): Campaign {
  const before = campaign.progression.taken;
  const accepted = acceptBuild(campaign.progression, id);
  if (!accepted) return campaign;
  const added = accepted.progression.taken.filter((item) => !before.includes(item));
  let party = campaign.party;
  for (const build of added) party = applyAllyBuild(party, build);
  return { ...campaign, progression: accepted.progression, party };
}
