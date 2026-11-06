export type BuildId = "long-stride" | "brush-cover" | "focused-strike" | "ward-plate" | "field-kit";

export interface BuildOffer {
  id: BuildId;
  kind: "skill" | "item";
  name: string;
  detail: string;
}

export const BUILD_POOL: readonly BuildOffer[] = [
  {
    id: "long-stride",
    kind: "skill",
    name: "Long stride",
    detail: "Amber move +1. Easier to reach brush or a flank.",
  },
  {
    id: "brush-cover",
    kind: "skill",
    name: "Brush cover",
    detail: "Amber standing in brush gains +2 defense. Brush still costs 2 move.",
  },
  {
    id: "focused-strike",
    kind: "skill",
    name: "Focused strike",
    detail: "Amber attack +2.",
  },
  {
    id: "ward-plate",
    kind: "item",
    name: "Ward plate",
    detail: "Amber defense +1 on every tile.",
  },
  {
    id: "field-kit",
    kind: "item",
    name: "Field kit",
    detail: "Amber max health +3, and each living fighter heals 3.",
  },
];

export interface ProgressionRules {
  enabled: boolean;
  xpPerHit: number;
  xpPerKill: number;
  coverDefense: number;
  healOnEmptyPool: number;
}

/** Reversible defaults. Set `enabled` to false to fight with the opening stats. */
export const PROGRESSION_DEFAULTS: ProgressionRules = {
  enabled: true,
  xpPerHit: 1,
  xpPerKill: 4,
  coverDefense: 2,
  healOnEmptyPool: 2,
};

export interface ProgressionState {
  xp: number;
  level: number;
  taken: BuildId[];
  pending: BuildOffer[];
}

export function freshProgression(): ProgressionState {
  return { xp: 0, level: 0, taken: [], pending: [] };
}

export function xpCostForNext(level: number): number {
  return 4 + level * 2;
}

export function offersFor(level: number, taken: readonly BuildId[]): BuildOffer[] {
  const open = BUILD_POOL.filter((offer) => !taken.includes(offer.id));
  if (open.length === 0) return [];
  const start = (level * 2) % open.length;
  const count = Math.min(3, open.length);
  const picked: BuildOffer[] = [];
  for (let index = 0; index < count; index++) picked.push(open[(start + index) % open.length]);
  return picked;
}

export function buildNames(taken: readonly BuildId[]): string {
  return taken
    .map((id) => BUILD_POOL.find((offer) => offer.id === id)?.name ?? id)
    .join(", ");
}

export interface LevelOpening {
  progression: ProgressionState;
  surplusHeals: number;
}

function openLevels(state: ProgressionState): LevelOpening {
  let next = state;
  let surplusHeals = 0;
  for (let guard = 0; guard < 12; guard++) {
    if (next.pending.length > 0) break;
    const cost = xpCostForNext(next.level);
    if (next.xp < cost) break;
    const offers = offersFor(next.level, next.taken);
    if (offers.length === 0) {
      next = { ...next, xp: next.xp - cost, level: next.level + 1 };
      surplusHeals += 1;
      continue;
    }
    next = { ...next, xp: next.xp - cost, pending: offers };
    break;
  }
  return { progression: next, surplusHeals };
}

export function addCombatXp(
  state: ProgressionState,
  amount: number,
  rules: ProgressionRules = PROGRESSION_DEFAULTS,
): LevelOpening {
  if (!rules.enabled || amount <= 0) return { progression: state, surplusHeals: 0 };
  return openLevels({ ...state, xp: state.xp + amount });
}

export function acceptBuild(state: ProgressionState, id: BuildId): LevelOpening | null {
  if (!state.pending.some((offer) => offer.id === id)) return null;
  return openLevels({
    ...state,
    level: state.level + 1,
    taken: [...state.taken, id],
    pending: [],
  });
}

export interface StatUnit {
  side: "player" | "enemy";
  atk: number;
  def: number;
  mov: number;
  hp: number;
  maxHp: number;
}

export function applyBuildToUnits<T extends StatUnit>(units: readonly T[], id: BuildId): T[] {
  return units.map((unit) => {
    if (unit.side !== "player" || unit.hp <= 0) return unit;
    if (id === "long-stride") return { ...unit, mov: unit.mov + 1 };
    if (id === "focused-strike") return { ...unit, atk: unit.atk + 2 };
    if (id === "ward-plate") return { ...unit, def: unit.def + 1 };
    if (id === "field-kit") {
      const maxHp = unit.maxHp + 3;
      return { ...unit, maxHp, hp: Math.min(maxHp, unit.hp + 3) };
    }
    return unit;
  });
}

export function defenseBonus(args: {
  side: "player" | "enemy";
  terrain: "plain" | "brush" | "stone";
  taken: readonly BuildId[];
  coverDefense?: number;
}): number {
  if (args.side !== "player") return 0;
  if (args.terrain !== "brush") return 0;
  if (!args.taken.includes("brush-cover")) return 0;
  return args.coverDefense ?? PROGRESSION_DEFAULTS.coverDefense;
}
