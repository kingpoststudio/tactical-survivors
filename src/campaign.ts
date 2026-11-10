import { freshProgression, type BuildId, type ProgressionState } from "./progression.ts";
import { createBattle, openingRoster, type GameState, type Unit } from "./game.ts";
import { type AnswerMode, type Difficulty } from "./mathcast.ts";

export const BATTLE_GOLD = 5;
export const BUN_COST = 2;
export const BUN_HP = 1;
export const RECRUIT_COST = 3;
export const REWARD_GOLD = 2;

export type NodeKind = "camp" | "battle" | "reward" | "town";

export interface WorldNode {
  id: string;
  name: string;
  kind: NodeKind;
  links: readonly string[];
}

export const WORLD: readonly WorldNode[] = [
  { id: "camp", name: "Camp", kind: "camp", links: ["meadow"] },
  { id: "meadow", name: "Meadow", kind: "battle", links: ["camp", "shrine"] },
  { id: "shrine", name: "Shrine", kind: "reward", links: ["meadow", "town"] },
  { id: "town", name: "Town", kind: "town", links: ["shrine"] },
];

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
    def: ally.def,
    mov: ally.mov,
    acted: false,
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
  return { kind: "map", campaign: next };
}

function restored(party: readonly Ally[], units: readonly Unit[]): Ally[] {
  return party.map((ally) => {
    const unit = units.find((item) => item.id === ally.id);
    if (!unit) return { ...ally, hp: ally.maxHp };
    return { ...ally, maxHp: unit.maxHp, hp: unit.maxHp, atk: unit.atk, def: unit.def, mov: unit.mov };
  });
}

export function returnFromBattle(campaign: Campaign, battle: GameState): Campaign {
  if (battle.phase !== "victory") return campaign;
  if (battle.winner !== "player") return { ...campaign, lastEvent: "The meadow holds. No gold." };
  const gold = campaign.gold + BATTLE_GOLD;
  const cleared = campaign.cleared.includes(campaign.nodeId) ? campaign.cleared : [...campaign.cleared, campaign.nodeId];
  return {
    ...campaign,
    gold,
    party: restored(campaign.party, battle.units),
    progression: {
      xp: battle.progression.xp,
      level: battle.progression.level,
      taken: [...battle.progression.taken],
      pending: [],
    },
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
