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

export type NodeKind = "camp" | "battle" | "reward" | "town" | "setup" | "boss";
export type Rarity = "common" | "rare";
export type KitId = "ember" | "band" | "spear" | "flare";
export const CLASS_OUTCOMES = ["Warden", "Sorceress", "Scout"] as const;
export type ClassOutcome = (typeof CLASS_OUTCOMES)[number];
export const WEAPON_OUTCOMES: readonly KitId[] = ["ember", "band", "spear"];
export const ENCOUNTER_MODES = ["pile", "twin", "extra"] as const;
export type EncounterMode = (typeof ENCOUNTER_MODES)[number];
export const WAGER_STAKE = 2;
export const REROLL_COST = 1;
export const OFFER_COST = 2;
export const BENCH_COST = 1;

export interface WorldNode {
  id: string;
  name: string;
  kind: NodeKind;
  links: readonly string[];
}

export const WORLD: readonly WorldNode[] = [
  { id: "camp", name: "Camp", kind: "camp", links: ["meadow", "glen"] },
  { id: "meadow", name: "Meadow", kind: "battle", links: ["camp", "shrine", "glen", "ford"] },
  { id: "glen", name: "Glen", kind: "setup", links: ["camp", "meadow", "town"] },
  { id: "shrine", name: "Shrine", kind: "reward", links: ["meadow", "town"] },
  { id: "town", name: "Town", kind: "town", links: ["shrine", "glen"] },
  { id: "ford", name: "Ford", kind: "town", links: ["meadow", "briar"] },
  { id: "briar", name: "Briar", kind: "battle", links: ["ford", "mill"] },
  { id: "mill", name: "Mill", kind: "town", links: ["briar", "hollow"] },
  { id: "hollow", name: "Hollow", kind: "battle", links: ["mill", "marsh"] },
  { id: "marsh", name: "Marsh", kind: "battle", links: ["hollow", "kiln"] },
  { id: "kiln", name: "Kiln", kind: "town", links: ["marsh", "ridge"] },
  { id: "ridge", name: "Ridge", kind: "battle", links: ["kiln", "orchard"] },
  { id: "orchard", name: "Orchard", kind: "battle", links: ["ridge", "gate"] },
  { id: "gate", name: "Gate", kind: "battle", links: ["orchard", "crown"] },
  { id: "crown", name: "Crown", kind: "boss", links: ["gate"] },
];

export interface RunSummary {
  outcome: "victory" | "defeat";
  party: string[];
  level: number;
  xp: number;
  builds: BuildId[];
  gear: string[];
  gold: number;
}

/** Fields shown when a run ends. Null until Crown is won or a fight is lost. */
export function summaryLines(campaign: Campaign): RunSummary | null {
  if (!campaign.summary) return null;
  const worn = campaign.party.flatMap((ally) => [ally.ability, ally.equip].filter((kit): kit is KitId => kit !== null));
  return {
    outcome: campaign.summary,
    party: campaign.party.map((ally) => ally.name),
    level: campaign.progression.level,
    xp: campaign.progression.xp,
    builds: [...campaign.progression.taken],
    gear: [...campaign.stash, ...worn].map((kit) => KITS[kit].name),
    gold: campaign.gold,
  };
}
export const ROUTE = ["meadow", "briar", "hollow", "marsh", "ridge", "orchard", "gate", "crown"] as const;

export function routeRank(nodeId: string): number {
  const index = ROUTE.indexOf(nodeId as (typeof ROUTE)[number]);
  return index < 0 ? 0 : index + 1;
}

export function scaleFor(rank: number): { hp: number; atk: number } {
  const step = Math.max(0, rank - 1);
  return { hp: step * 2, atk: Math.floor(step / 2) };
}

/** A kit may favor a class. Any ally can still wear it. */
export const KITS: Record<KitId, { name: string; favors: ClassOutcome; slot: "ability" | "equip" }> = {
  ember: { name: "Ember", favors: "Sorceress", slot: "ability" },
  band: { name: "Band", favors: "Warden", slot: "equip" },
  spear: { name: "Spear", favors: "Scout", slot: "equip" },
  flare: { name: "Flare", favors: "Sorceress", slot: "ability" },
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
  ability: "ember" | "flare" | null;
  equip: "band" | "spear" | null;
  /** A second class. It does not block gear or spells. */
  secondary: ClassOutcome | null;
  benched: boolean;
}

export interface DropRoll {
  weapon: KitId | null;
  favor: ClassOutcome;
  build: BuildId | null;
  ability: "flare" | null;
}

export interface Twist {
  nodeId: string;
  problem: MathProblem;
  outcome: "open" | "hit" | "fizzle";
}

export interface Wager {
  stake: number;
  problem: MathProblem;
  outcome: "open" | "won" | "lost";
}

export type ShopOffer =
  | { kind: "kit"; kit: KitId; favor: ClassOutcome }
  | { kind: "build"; build: BuildId; favor: ClassOutcome };

export type UpgradeKind = "hp" | "atk" | "fire" | "perk";

export interface UpgradeCard {
  kind: UpgradeKind;
  name: string;
  detail: string;
  /** A class may like this card. Any ally can still take it. */
  favors: ClassOutcome;
}

export interface LevelPick {
  allyId: string;
  level: number;
  cards: UpgradeCard[];
}

export interface ShelfOffer {
  name: string;
  tier: 1 | 2 | 3;
  cost: number;
  kit: KitId;
  locked: boolean;
}

export type RewardOffer =
  | { kind: "weapon"; kit: "band" | "spear"; favor: ClassOutcome }
  | { kind: "ability"; kit: "ember" | "flare"; favor: ClassOutcome }
  | { kind: "class"; role: ClassOutcome; favor: ClassOutcome };

export interface SavedRun {
  version: 1;
  campaign: Campaign;
  fast: boolean;
}

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
  modes: Partial<Record<string, EncounterMode>>;
  twist: Twist | null;
  /** Pick one after a win. Empty means no choice is waiting. */
  rewards: RewardOffer[];
  /** Latest player-chosen ending. Travel stays open. */
  summary: "victory" | "defeat" | null;
  found: { role: string; kit: KitId; rarity: Rarity }[];
  /** Three cards for one ally. It waits until the player picks. */
  levelPick: LevelPick | null;
  /** Town shelf. A locked row stays through a reroll. */
  shelf: ShelfOffer[];
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
    secondary: null,
    benched: false,
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
    secondary: null,
    benched: false,
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
    modes: {},
    twist: null,
    rewards: [],
    summary: null,
    found: [],
    levelPick: null,
    shelf: [],
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

/** A warden with Ember or Flare hits for 1 more. Any class can still wear the fire. */
export function fireBonus(ally: { role: string; ability: "ember" | "flare" | null }): number {
  if (ally.role !== "Warden") return 0;
  if (ally.ability !== "ember" && ally.ability !== "flare") return 0;
  return 1;
}

/** Same monster type and seed, same rarity drop. */
export function typeDrop(role: string, seed: number): { kit: KitId; rarity: Rarity } {
  const rng = mixSeed((foldName(role) ^ Math.imul((seed + 3) >>> 0, 0x9e3779b1)) >>> 0);
  const rare = rng() < 0.25;
  if (role === "Brute") return { kit: rare ? "ember" : "band", rarity: rare ? "rare" : "common" };
  if (role === "Raider") return { kit: rare ? "flare" : "spear", rarity: rare ? "rare" : "common" };
  return { kit: rare ? "ember" : "flare", rarity: rare ? "rare" : "common" };
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
    atk: ally.atk + (ally.equip === "spear" ? 1 : 0) + fireBonus(ally),
    def: ally.def + (ally.equip === "band" ? 1 : 0),
    mov: ally.mov,
    acted: false,
    ability: ally.ability,
  };
}

export function startBattle(campaign: Campaign): GameState {
  const scale = scaleFor(routeRank(campaign.nodeId));
  let enemies = openingRoster()
    .filter((unit) => unit.side === "enemy")
    .map((unit) => ({
      ...unit,
      hp: unit.maxHp + scale.hp,
      maxHp: unit.maxHp + scale.hp,
      atk: unit.atk + scale.atk,
    }));
  if (campaign.nodeId === "crown") {
    enemies = enemies.map((unit) =>
      unit.id === "ash" ? { ...unit, name: "Cinderheart", hp: unit.hp + 6, maxHp: unit.maxHp + 6, atk: unit.atk + 2 } : unit,
    );
  }
  const allies = campaign.party.filter((ally) => ally.hp > 0 && !ally.benched).map(toUnit);
  return createBattle({
    pressure: { enabled: false, waves: [] },
    units: [...allies, ...enemies],
    casters: campaign.party.filter((ally) => ally.spell && ally.hp > 0 && !ally.benched).map((ally) => ally.id),
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
  let next: Campaign = { ...revealEncounter(campaign, nodeId), nodeId };
  if (node.kind === "reward") next = claimReward(next);
  if (node.kind === "battle" || node.kind === "boss") {
    return { kind: "battle", campaign: { ...next, lastEvent: node.kind === "boss" ? "Crown." : "A fight starts." }, battle: startBattle(next) };
  }
  if (node.kind === "town") {
    next = { ...next, lastEvent: "Town." };
    if (next.shelf.length === 0) next = { ...next, shelf: shelfFor(next.seed, shopProgress(next)) };
  }
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
  if (weapons.length === 0 && builds.length === 0 && !owned.includes("flare")) return null;
  const abilities = owned.includes("flare") ? [] : (["flare"] as const);
  return {
    weapon: weapons.length > 0 ? pick(weapons, rng) : null,
    favor: pick(CLASS_OUTCOMES, rng),
    build: builds.length > 0 ? pick(builds, rng) : null,
    ability: abilities.length > 0 ? pick(abilities, rng) : null,
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
    if (drop.ability && !have.includes(drop.ability)) {
      kits.push(drop.ability);
      have.push(drop.ability);
      favors[drop.ability] = drop.favor;
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
    if (slot === "ability") return { ...item, ability: kit === "flare" ? ("flare" as const) : ("ember" as const) };
    return { ...item, equip: kit === "spear" ? ("spear" as const) : ("band" as const) };
  });
  return { ...campaign, stash, party };
}

export function swapKit(campaign: Campaign, fromId: string, toId: string, slot: "ability" | "equip"): Campaign {
  if (fromId === toId) return campaign;
  const from = campaign.party.find((ally) => ally.id === fromId);
  const to = campaign.party.find((ally) => ally.id === toId);
  if (!from || !to || from.benched || to.benched) return campaign;
  return {
    ...campaign,
    party: campaign.party.map((ally) => {
      if (ally.id === fromId) return slot === "ability" ? { ...ally, ability: to.ability } : { ...ally, equip: to.equip };
      if (ally.id === toId) return slot === "ability" ? { ...ally, ability: from.ability } : { ...ally, equip: from.equip };
      return ally;
    }),
  };
}

export function benchAlly(campaign: Campaign, id: string): Campaign {
  if (campaign.gold < BENCH_COST) return campaign;
  const active = campaign.party.filter((ally) => ally.hp > 0 && !ally.benched);
  if (active.length < 2 || !active.some((ally) => ally.id === id)) return campaign;
  const gold = campaign.gold - BENCH_COST;
  return {
    ...campaign,
    gold,
    party: campaign.party.map((ally) => (ally.id === id ? { ...ally, benched: true } : ally)),
    lastEvent: `${campaign.gold} − ${BENCH_COST} = ${gold}.`,
  };
}

export function recallAlly(campaign: Campaign, id: string): Campaign {
  if (campaign.gold < BENCH_COST) return campaign;
  const ally = campaign.party.find((item) => item.id === id);
  if (!ally?.benched) return campaign;
  const gold = campaign.gold - BENCH_COST;
  return {
    ...campaign,
    gold,
    party: campaign.party.map((item) => (item.id === id ? { ...item, benched: false } : item)),
    lastEvent: `${campaign.gold} − ${BENCH_COST} = ${gold}.`,
  };
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
      atk: unit.atk - spear - fireBonus(ally),
      def: unit.def - band,
      mov: unit.mov,
    };
  });
}

export function returnFromBattle(campaign: Campaign, battle: GameState, rng: () => number = Math.random): Campaign {
  if (battle.phase !== "victory") return campaign;
  const mode = campaign.modes[campaign.nodeId];
  const defeated = battle.units.filter((unit) => unit.side === "enemy" && unit.hp <= 0).length + (mode === "extra" ? 1 : 0);
  const dropped = collectDrops(defeated, ownedKits(campaign), battle.progression.taken, rng);
  let party = battle.winner === "player" ? restored(campaign.party, battle.units) : campaign.party;
  for (const id of dropped.builds) party = applyAllyBuild(party, id);
  const fallen = battle.units.filter((unit) => unit.side === "enemy" && unit.hp <= 0);
  const found = fallen.map((unit, index) => ({ role: unit.role, ...typeDrop(unit.role, (campaign.seed + index + 1) >>> 0) }));
  const extraKits = found.map((drop) => drop.kit).filter((kit) => !ownedKits(campaign).includes(kit) && !dropped.kits.includes(kit));
  const carried: Campaign = {
    ...campaign,
    stash: [...campaign.stash, ...dropped.kits, ...extraKits.filter((kit, index) => extraKits.indexOf(kit) === index)],
    favors: { ...campaign.favors, ...dropped.favors },
    party,
    found,
    summary: battle.winner === "player" ? (campaign.nodeId === "crown" ? "victory" : campaign.summary) : "defeat",
    progression: {
      xp: battle.progression.xp,
      level: battle.progression.level,
      taken: [...battle.progression.taken, ...dropped.builds],
      pending: [],
    },
  };
  if (battle.winner !== "player") return offerLevelPick(campaign, { ...carried, lastEvent: "The meadow holds. No gold." });
  const payout = mode === "twin" ? BATTLE_GOLD * 2 : BATTLE_GOLD;
  const gold = campaign.gold + payout;
  const cleared = campaign.cleared.includes(campaign.nodeId) ? campaign.cleared : [...campaign.cleared, campaign.nodeId];
  return offerLevelPick(campaign, {
    ...carried,
    gold,
    cleared,
    rewards: rewardOffers((campaign.seed ^ foldName(campaign.nodeId)) >>> 0, campaign.nodeId, ownedKits(carried)),
    lastEvent: `Clear. ${campaign.gold} + ${payout} = ${gold}.`,
  });
}

/** Stake game gold on a math problem. A wrong answer spends the stake and never pays the typed number. */
export function offerWager(campaign: Campaign, rng: () => number = Math.random): Campaign {
  if (nodeById(campaign.nodeId).kind !== "town" || campaign.wager?.outcome === "open" || campaign.gold < WAGER_STAKE) return campaign;
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
  if (nodeById(campaign.nodeId).kind !== "town" || campaign.bunBought || campaign.gold < BUN_COST) return campaign;
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
  if (nodeById(campaign.nodeId).kind !== "town" || campaign.recruited || campaign.gold < RECRUIT_COST) return campaign;
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

/** Spend 1 gold to draw a new pair of offers. Locked shelf rows stay. No clock. */
export function rerollShop(campaign: Campaign): Campaign {
  if (campaign.gold < REROLL_COST) return campaign;
  const seed = (campaign.seed + 1) >>> 0;
  const gold = campaign.gold - REROLL_COST;
  const fresh = shelfFor(seed, shopProgress(campaign));
  const width = Math.max(fresh.length, campaign.shelf.length);
  const shelf: ShelfOffer[] = [];
  for (let index = 0; index < width; index++) {
    if (campaign.shelf[index]?.locked) shelf.push(campaign.shelf[index]);
    else if (fresh[index]) shelf.push({ ...fresh[index], locked: false });
  }
  return {
    ...campaign,
    gold,
    seed,
    offers: offersFromSeed(seed, ownedKits(campaign), campaign.progression.taken),
    shelf,
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

const UPGRADE_DECK: readonly UpgradeCard[] = [
  { kind: "hp", name: "+2 HP", detail: "2 more hearts.", favors: "Warden" },
  { kind: "atk", name: "+1 attack", detail: "Hits for 1 more.", favors: "Scout" },
  { kind: "fire", name: "Ember", detail: "A fire ability. Favored by Sorceress. Any class can take it.", favors: "Sorceress" },
  { kind: "perk", name: "Steady", detail: "Defense +1. A favored class gets +1 more.", favors: "Warden" },
];

/** Three cards. Same ally, seed, and level, same cards. Ember is always one of them. */
export function levelCards(seed: number, allyId: string, level: number): UpgradeCard[] {
  const fire = UPGRADE_DECK.find((card) => card.kind === "fire");
  if (!fire) return [];
  const rest = UPGRADE_DECK.filter((card) => card.kind !== "fire");
  const rng = mixSeed((foldName(allyId) ^ Math.imul((seed + level + 1) >>> 0, 0x9e3779b1)) >>> 0);
  const bag = [...rest];
  const picked: UpgradeCard[] = [fire];
  while (picked.length < 3 && bag.length > 0) picked.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  for (let index = picked.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    const hold = picked[index];
    picked[index] = picked[swap];
    picked[swap] = hold;
  }
  return picked;
}

/** Open a card pick when the party level went up. It does not spend extra XP and it does not expire. */
export function offerLevelPick(before: Campaign, after: Campaign): Campaign {
  if (after.levelPick || after.progression.level <= before.progression.level) return after;
  const ally = after.party.find((item) => item.hp > 0 && !item.benched) ?? after.party[0];
  if (!ally) return after;
  return {
    ...after,
    levelPick: { allyId: ally.id, level: after.progression.level, cards: levelCards(after.seed, ally.id, after.progression.level) },
  };
}

/** Take one card for that ally. Class favor is a bonus, not a lock. */
export function takeLevelCard(campaign: Campaign, index: number): Campaign {
  const pick = campaign.levelPick;
  const card = pick?.cards[index];
  if (!pick || !card) return campaign;
  const party = campaign.party.map((ally) => {
    if (ally.id !== pick.allyId) return ally;
    if (card.kind === "hp") return { ...ally, maxHp: ally.maxHp + 2, hp: ally.hp + 2 };
    if (card.kind === "atk") return { ...ally, atk: ally.atk + 1 };
    if (card.kind === "fire") {
      const stronger = ally.ability === "ember" || ally.ability === "flare" ? 1 : 0;
      return { ...ally, ability: ally.ability ?? "ember", atk: ally.atk + stronger };
    }
    const favored = ally.role === card.favors || ally.secondary === card.favors;
    return { ...ally, def: ally.def + 1 + (favored ? 1 : 0) };
  });
  return { ...campaign, party, levelPick: null, lastEvent: card.name };
}

const SHELF_CATALOG: readonly Omit<ShelfOffer, "locked">[] = [
  { name: "Band", tier: 1, cost: 2, kit: "band" },
  { name: "Spear", tier: 1, cost: 2, kit: "spear" },
  { name: "Ember", tier: 2, cost: 3, kit: "ember" },
  { name: "Flare", tier: 3, cost: 4, kit: "flare" },
];

/** Later stops stock better tiers. Rank is route progress, not a clock. */
export function shopTier(rank: number): 1 | 2 | 3 {
  if (rank >= 6) return 3;
  if (rank >= 3) return 2;
  return 1;
}

export function shopProgress(campaign: Campaign): number {
  const ranks = campaign.cleared.map((id) => routeRank(id));
  return Math.max(routeRank(campaign.nodeId), ...ranks, 0);
}

/** Same seed and rank, same shelf. The best tier for that rank is always offered. */
export function shelfFor(seed: number, rank: number): ShelfOffer[] {
  const tier = shopTier(rank);
  const pool = SHELF_CATALOG.filter((item) => item.tier <= tier);
  const rng = mixSeed((seed ^ Math.imul(rank + 1, 0x85ebca6b)) >>> 0);
  const bag = [...pool];
  const picked: ShelfOffer[] = [];
  const lead = bag.findIndex((item) => item.tier === tier);
  if (lead >= 0) picked.push({ ...bag.splice(lead, 1)[0], locked: false });
  const count = Math.min(3, pool.length);
  while (picked.length < count && bag.length > 0) {
    picked.push({ ...bag.splice(Math.floor(rng() * bag.length), 1)[0], locked: false });
  }
  return picked;
}

export function lockShelf(campaign: Campaign, index: number): Campaign {
  const item = campaign.shelf[index];
  if (!item) return campaign;
  return {
    ...campaign,
    shelf: campaign.shelf.map((offer, slot) => (slot === index ? { ...offer, locked: !offer.locked } : offer)),
  };
}

export function buyShelf(campaign: Campaign, index: number): Campaign {
  const item = campaign.shelf[index];
  if (!item || campaign.gold < item.cost || ownedKits(campaign).includes(item.kit)) return campaign;
  const gold = campaign.gold - item.cost;
  return {
    ...campaign,
    gold,
    stash: [...campaign.stash, item.kit],
    shelf: campaign.shelf.filter((_, slot) => slot !== index),
    lastEvent: `${campaign.gold} − ${item.cost} = ${gold}.`,
  };
}

export const SELL_GOLD = 1;

/** Sell one kit from the stash or from an ally. Pays game gold only. */
export function sellGear(campaign: Campaign, kit: KitId): Campaign {
  const stashAt = campaign.stash.indexOf(kit);
  const gold = campaign.gold + SELL_GOLD;
  if (stashAt >= 0) {
    const stash = campaign.stash.filter((_, index) => index !== stashAt);
    return { ...campaign, gold, stash, lastEvent: `Sold. ${campaign.gold} + ${SELL_GOLD} = ${gold}.` };
  }
  const wearer = campaign.party.find((ally) => ally.ability === kit || ally.equip === kit);
  if (!wearer) return campaign;
  return {
    ...campaign,
    gold,
    party: campaign.party.map((ally) =>
      ally.id === wearer.id
        ? { ...ally, ability: ally.ability === kit ? null : ally.ability, equip: ally.equip === kit ? null : ally.equip }
        : ally,
    ),
    lastEvent: `Sold. ${campaign.gold} + ${SELL_GOLD} = ${gold}.`,
  };
}

/** A hint when two related kits are owned. Null when the pair is incomplete. */
export function synergyHint(owned: readonly KitId[]): string | null {
  const has = (kit: KitId) => owned.includes(kit);
  if (has("ember") && has("flare")) return "Fire pair. Ember and Flare.";
  if (has("band") && has("spear")) return "Guard pair. Band and Spear.";
  return null;
}

export function synergyFor(campaign: Campaign): string | null {
  return synergyHint(ownedKits(campaign));
}

function foldName(nodeId: string): number {
  let hash = 2166136261;
  for (const char of nodeId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** The twist for a place. Same node and seed, same twist. */
export function encounterMode(nodeId: string, seed: number): EncounterMode {
  const rng = mixSeed((foldName(nodeId) ^ (seed >>> 0)) >>> 0);
  return ENCOUNTER_MODES[Math.floor(rng() * ENCOUNTER_MODES.length)];
}

function revealEncounter(campaign: Campaign, nodeId: string): Campaign {
  let next = campaign;
  if (!next.modes[nodeId]) {
    next = { ...next, modes: { ...next.modes, [nodeId]: encounterMode(nodeId, next.seed) } };
  }
  if (next.modes[nodeId] === "pile" && next.twist?.nodeId !== nodeId) {
    const rng = mixSeed((foldName(nodeId) ^ (next.seed >>> 0)) >>> 0);
    next = { ...next, twist: { nodeId, problem: makeProblem(next.difficulty, rng), outcome: "open" } };
  }
  return next;
}

/** A pile pays the answer in gold. A wrong number pays nothing. */
export function settleTwist(campaign: Campaign, given: number): Campaign {
  const twist = campaign.twist;
  if (!twist || twist.outcome !== "open" || twist.nodeId !== campaign.nodeId) return campaign;
  const grade = gradeAnswer(twist.problem, given);
  if (!grade) return campaign;
  if (!grade.correct) {
    return { ...campaign, twist: { ...twist, outcome: "fizzle" }, lastEvent: twist.problem.prompt };
  }
  const gold = campaign.gold + twist.problem.answer;
  return {
    ...campaign,
    gold,
    twist: { ...twist, outcome: "hit" },
    lastEvent: `${campaign.gold} + ${twist.problem.answer} = ${gold}.`,
  };
}

const REWARD_WEAPONS = ["band", "spear"] as const;
const REWARD_ABILITIES = ["ember", "flare"] as const;

/** Two or three post-battle offers. Same seed and place, same offers. */
export function rewardOffers(seed: number, nodeId: string, owned: readonly KitId[]): RewardOffer[] {
  const rng = mixSeed((foldName(nodeId) ^ Math.imul((seed + 1) >>> 0, 0x85ebca6b)) >>> 0);
  const count = rng() < 0.5 ? 2 : 3;
  const weapons = REWARD_WEAPONS.filter((kit) => !owned.includes(kit));
  const abilities = REWARD_ABILITIES.filter((kit) => !owned.includes(kit));
  const classes = [...CLASS_OUTCOMES];
  const buckets: Array<{ take: () => RewardOffer | null }> = [
    {
      take: () => {
        if (weapons.length === 0) return null;
        const kit = weapons.splice(Math.floor(rng() * weapons.length), 1)[0];
        const favor = CLASS_OUTCOMES[Math.floor(rng() * CLASS_OUTCOMES.length)];
        return { kind: "weapon", kit, favor };
      },
    },
    {
      take: () => {
        if (abilities.length === 0) return null;
        const kit = abilities.splice(Math.floor(rng() * abilities.length), 1)[0];
        const favor = CLASS_OUTCOMES[Math.floor(rng() * CLASS_OUTCOMES.length)];
        return { kind: "ability", kit, favor };
      },
    },
    {
      take: () => {
        if (classes.length === 0) return null;
        const role = classes.splice(Math.floor(rng() * classes.length), 1)[0];
        const favor = CLASS_OUTCOMES[Math.floor(rng() * CLASS_OUTCOMES.length)];
        return { kind: "class", role, favor };
      },
    },
  ];
  for (let index = buckets.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    const hold = buckets[index];
    buckets[index] = buckets[swap];
    buckets[swap] = hold;
  }
  const offers: RewardOffer[] = [];
  for (const bucket of buckets) {
    if (offers.length >= count) break;
    const offer = bucket.take();
    if (offer) offers.push(offer);
  }
  while (offers.length < 2) {
    const extra = buckets.map((bucket) => bucket.take()).find((offer) => offer);
    if (!extra) break;
    offers.push(extra);
  }
  return offers;
}

/** Take one reward. The others go away. A class favor does not lock gear. */
export function takeReward(campaign: Campaign, index: number, allyId: string): Campaign {
  const offer = campaign.rewards[index];
  if (!offer) return campaign;
  if (offer.kind === "class") {
    if (!campaign.party.some((ally) => ally.id === allyId && ally.hp > 0)) return campaign;
    return {
      ...campaign,
      rewards: [],
      party: campaign.party.map((ally) => (ally.id === allyId ? { ...ally, secondary: offer.role } : ally)),
    };
  }
  if (campaign.stash.includes(offer.kit) || campaign.party.some((ally) => ally.ability === offer.kit || ally.equip === offer.kit)) {
    return { ...campaign, rewards: [] };
  }
  return {
    ...campaign,
    rewards: [],
    stash: [...campaign.stash, offer.kit],
    favors: { ...campaign.favors, [offer.kit]: offer.favor },
  };
}

export const RUN_SAVE_KEY = "tactical-survivors-run";

export function saveRun(campaign: Campaign, fast: boolean): string {
  return JSON.stringify({ version: 1, campaign, fast });
}

export function loadRun(raw: string | null): SavedRun | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { version?: unknown; campaign?: Campaign; fast?: unknown };
    if (!data || data.version !== 1 || !data.campaign) return null;
    const campaign = data.campaign;
    if (typeof campaign.nodeId !== "string" || typeof campaign.gold !== "number" || !Array.isArray(campaign.party)) return null;
    if (!campaign.progression || typeof campaign.progression.level !== "number") return null;
    return {
      version: 1,
      fast: data.fast === true,
      campaign: {
        ...createCampaign(),
        ...campaign,
        party: campaign.party,
        progression: campaign.progression,
        stash: campaign.stash ?? [],
        favors: campaign.favors ?? {},
        offers: campaign.offers ?? [],
        modes: campaign.modes ?? {},
        rewards: campaign.rewards ?? [],
        cleared: campaign.cleared ?? [],
        seed: campaign.seed ?? 0,
        wager: campaign.wager ?? null,
        twist: campaign.twist ?? null,
        found: campaign.found ?? [],
        summary: campaign.summary ?? null,
        levelPick: campaign.levelPick ?? null,
        shelf: campaign.shelf ?? [],
      },
    };
  } catch {
    return null;
  }
}
