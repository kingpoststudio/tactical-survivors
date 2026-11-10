import { freshProgression, type BuildId, type ProgressionState } from "./progression.ts";
import { createBattle, openingRoster, type GameState, type Unit } from "./game.ts";
import { type AnswerMode, type Difficulty } from "./mathcast.ts";

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
export type KitId = "ember" | "band";

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

/** Ember favors a sorceress. Band favors a warden. Either can be worn by any ally. */
export const KITS: Record<KitId, { name: string; favors: string; slot: "ability" | "equip" }> = {
  ember: { name: "Ember", favors: "Sorceress", slot: "ability" },
  band: { name: "Band", favors: "Warden", slot: "equip" },
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
  equip: "band" | null;
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
    atk: ally.atk,
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

export function dropsFor(defeated: number, owned: readonly KitId[]): KitId[] {
  const gained: KitId[] = [];
  let left = Math.max(0, defeated);
  for (const id of ["ember", "band"] as const) {
    if (left <= 0) break;
    if (owned.includes(id)) continue;
    gained.push(id);
    left -= 1;
  }
  return gained;
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
    return slot === "ability" ? { ...item, ability: "ember" as const } : { ...item, equip: "band" as const };
  });
  return { ...campaign, stash, party };
}

function restored(party: readonly Ally[], units: readonly Unit[]): Ally[] {
  return party.map((ally) => {
    const unit = units.find((item) => item.id === ally.id);
    if (!unit) return { ...ally, hp: ally.maxHp };
    const band = ally.equip === "band" ? 1 : 0;
    return { ...ally, maxHp: unit.maxHp, hp: unit.maxHp, atk: unit.atk, def: unit.def - band, mov: unit.mov };
  });
}

export function returnFromBattle(campaign: Campaign, battle: GameState): Campaign {
  if (battle.phase !== "victory") return campaign;
  const defeated = battle.units.filter((unit) => unit.side === "enemy" && unit.hp <= 0).length;
  const carried = {
    ...campaign,
    stash: [...campaign.stash, ...dropsFor(defeated, ownedKits(campaign))],
    progression: {
      xp: battle.progression.xp,
      level: battle.progression.level,
      taken: [...battle.progression.taken],
      pending: [],
    },
  };
  if (battle.winner !== "player") return { ...carried, lastEvent: "The meadow holds. No gold." };
  const gold = campaign.gold + BATTLE_GOLD;
  const cleared = campaign.cleared.includes(campaign.nodeId) ? campaign.cleared : [...campaign.cleared, campaign.nodeId];
  return {
    ...carried,
    gold,
    party: restored(campaign.party, battle.units),
    cleared,
    lastEvent: `Clear. ${campaign.gold} + ${BATTLE_GOLD} = ${gold}.`,
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
