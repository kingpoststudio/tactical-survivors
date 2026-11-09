import { gradeAnswer, makeProblem, SPELL_RANGE, type AnswerMode, type Difficulty, type MathProblem } from "./mathcast.ts";
import { lastPressureRound, planReinforcements, waveForRound, type PressureRules, PRESSURE_DEFAULTS } from "./pressure.ts";
import {
  acceptBuild,
  addCombatXp,
  applyBuildToUnits,
  defenseBonus,
  freshProgression,
  type BuildId,
  type ProgressionRules,
  type ProgressionState,
  PROGRESSION_DEFAULTS,
} from "./progression.ts";

export const COLS = 8;
export const ROWS = 7;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const STONE: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [3, 2],
  [5, 2],
  [6, 2],
  [4, 4],
];

const BRUSH: ReadonlyArray<readonly [number, number]> = [
  [1, 3],
  [2, 3],
  [5, 3],
  [6, 3],
  [1, 4],
  [6, 4],
  [3, 5],
  [4, 5],
];

export type Side = "player" | "enemy";
export type Phase = "player" | "enemy" | "level" | "victory" | "cast";
export type Intent = "move" | "strike" | "cast";
export type Terrain = "plain" | "brush" | "stone";

export interface SpellCast {
  casterId: string;
  targetId: string;
  problem: MathProblem;
  outcome: "open" | "hit" | "fizzle";
  given: number | null;
  damage: number;
}

export interface Tile {
  col: number;
  row: number;
}

export interface Unit {
  id: string;
  name: string;
  role: string;
  side: Side;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mov: number;
  acted: boolean;
  tier?: number;
}

export interface GameState {
  units: Unit[];
  phase: Phase;
  winner: Side | null;
  selectedId: string | null;
  intent: Intent;
  round: number;
  lastEvent: string;
  enemyStep: number;
  pressure: PressureRules;
  spawnedRounds: number[];
  progression: ProgressionState;
  progressionRules: ProgressionRules;
  casters: string[];
  difficulty: Difficulty;
  answerMode: AnswerMode;
  spell: SpellCast | null;
  random: () => number;
}

export interface BattleOptions {
  pressure?: PressureRules;
  progression?: ProgressionRules;
  progressionState?: ProgressionState;
  units?: readonly Unit[];
  casters?: readonly string[];
  difficulty?: Difficulty;
  answerMode?: AnswerMode;
  random?: () => number;
}

export interface Reach {
  cost: Map<string, number>;
  parent: Map<string, string>;
}

export const EMPTY_REACH: Reach = { cost: new Map(), parent: new Map() };

const ROSTER: ReadonlyArray<Omit<Unit, "hp" | "acted">> = [
  { id: "ilya", name: "Oak", role: "Warden", side: "player", col: 1, row: 6, maxHp: 12, atk: 4, def: 2, mov: 3 },
  { id: "mora", name: "Lumen", role: "Sorceress", side: "player", col: 3, row: 6, maxHp: 9, atk: 6, def: 1, mov: 4 },
  { id: "penn", name: "Batling", role: "Scout", side: "player", col: 6, row: 6, maxHp: 7, atk: 4, def: 0, mov: 5 },
  { id: "ash", name: "Boulder", role: "Brute", side: "enemy", col: 1, row: 0, maxHp: 12, atk: 5, def: 2, mov: 3 },
  { id: "ruck", name: "Moonhat", role: "Raider", side: "enemy", col: 4, row: 0, maxHp: 9, atk: 5, def: 1, mov: 4 },
  { id: "vetch", name: "Wavefin", role: "Skirmisher", side: "enemy", col: 6, row: 0, maxHp: 7, atk: 4, def: 0, mov: 5 },
];

export const ROSTER_ORDER = new Map(ROSTER.map((unit, index) => [unit.id, index]));

function buildTerrain(): Terrain[][] {
  const grid: Terrain[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => "plain" as Terrain));
  for (const [col, row] of STONE) grid[row][col] = "stone";
  for (const [col, row] of BRUSH) grid[row][col] = "brush";
  return grid;
}

export const TERRAIN = buildTerrain();

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

function inBounds(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

export function living(units: Unit[]): Unit[] {
  return units.filter((unit) => unit.hp > 0);
}

export function at(units: Unit[], col: number, row: number): Unit | null {
  return living(units).find((unit) => unit.col === col && unit.row === row) ?? null;
}

export function blurb(role: string): string {
  switch (role) {
    case "Warden":
      return "Heavy defense, short stride.";
    case "Blade":
      return "The hardest hitter in the squad.";
    case "Sorceress":
      return "Pointed hat, and the hardest hit.";
    case "Scout":
      return "Long stride, no armor.";
    case "Friend":
      return "A small ally.";
    case "Brute":
      return "Slow, and hard to drop.";
    case "Raider":
      return "Closes in and hits hard.";
    case "Skirmisher":
      return "Fast, and easy to drop.";
    default:
      return role;
  }
}

export function openingRoster(): Unit[] {
  return ROSTER.map((unit) => ({ ...unit, hp: unit.maxHp, acted: false }));
}

export function createBattle(options: BattleOptions = {}): GameState {
  const pressure = options.pressure ?? PRESSURE_DEFAULTS;
  const progressionRules = options.progression ?? PROGRESSION_DEFAULTS;
  const seeded = options.progressionState;
  const units = (options.units ?? openingRoster()).map((unit) => ({ ...unit, acted: false }));
  return {
    units,
    phase: "player",
    winner: null,
    selectedId: null,
    intent: "move",
    round: 1,
    lastEvent: "",
    enemyStep: 0,
    pressure,
    spawnedRounds: [],
    progression: seeded
      ? { xp: seeded.xp, level: seeded.level, taken: [...seeded.taken], pending: [] }
      : freshProgression(),
    progressionRules,
    casters: [...(options.casters ?? [])],
    difficulty: options.difficulty ?? "within-5",
    answerMode: options.answerMode ?? "choice",
    spell: null,
    random: options.random ?? Math.random,
  };
}

export function winnerOf(g: GameState): Side | null {
  const players = living(g.units).some((unit) => unit.side === "player");
  if (!players) return "enemy";
  const enemies = living(g.units).some((unit) => unit.side === "enemy");
  if (enemies) return null;
  if (!g.pressure.enabled || g.pressure.waves.length === 0) return "player";
  const last = lastPressureRound(g.pressure);
  if (g.spawnedRounds.includes(last) && g.round >= last) return "player";
  return null;
}

export function inSpellRange(caster: Pick<Unit, "col" | "row">, target: Pick<Unit, "col" | "row">): boolean {
  const steps = Math.abs(caster.col - target.col) + Math.abs(caster.row - target.row);
  return steps > 0 && steps <= SPELL_RANGE;
}

export function spellTargetIds(g: GameState): string[] {
  const actor = commandingUnit(g);
  if (!actor || !g.casters.includes(actor.id)) return [];
  return living(g.units)
    .filter((unit) => unit.side === "enemy" && inSpellRange(actor, unit))
    .map((unit) => unit.id);
}

export function beginCast(g: GameState, targetId: string, rng: () => number = g.random): GameState {
  if (g.phase !== "player") return g;
  const actor = commandingUnit(g);
  if (!actor || !g.casters.includes(actor.id)) return g;
  const target = living(g.units).find((unit) => unit.id === targetId && unit.side === "enemy");
  if (!target || !inSpellRange(actor, target)) return g;
  return {
    ...g,
    phase: "cast",
    intent: "cast",
    spell: {
      casterId: actor.id,
      targetId: target.id,
      problem: makeProblem(g.difficulty, rng),
      outcome: "open",
      given: null,
      damage: 0,
    },
  };
}

export function armCast(g: GameState, rng: () => number = g.random): GameState {
  const ids = spellTargetIds(g);
  if (ids.length === 0) return g;
  if (ids.length === 1) return beginCast(g, ids[0], rng);
  const actor = commandingUnit(g);
  return { ...g, intent: "cast", lastEvent: actor ? `${actor.name} can cast.` : g.lastEvent };
}

export function answerCast(g: GameState, given: number): GameState {
  if (g.phase !== "cast" || !g.spell || g.spell.outcome !== "open") return g;
  const verdict = gradeAnswer(g.spell.problem, given);
  if (!verdict) return g;
  const caster = g.units.find((unit) => unit.id === g.spell?.casterId);
  const target = g.units.find((unit) => unit.id === g.spell?.targetId);
  if (!caster || !target) return g;
  const prompt = g.spell.problem.prompt;
  if (!verdict.correct) {
    return {
      ...g,
      spell: { ...g.spell, outcome: "fizzle", given, damage: verdict.damage },
      lastEvent: `${caster.name} casts Spark. ${prompt}. Fizzle.`,
    };
  }
  const damage = g.spell.problem.answer;
  const hp = Math.max(0, target.hp - damage);
  const units = g.units.map((unit) => (unit.id === target.id ? { ...unit, hp } : unit));
  const lastEvent =
    hp === 0
      ? `${caster.name} casts Spark. ${prompt} = ${damage}. ${target.name} falls.`
      : `${caster.name} casts Spark. ${prompt} = ${damage}. ${target.name} takes ${damage}.`;
  return {
    ...g,
    units,
    spell: { ...g.spell, outcome: "hit", given, damage },
    lastEvent,
  };
}

export function finishCast(g: GameState): GameState {
  if (g.phase !== "cast" || !g.spell || g.spell.outcome === "open") return g;
  const target = g.units.find((unit) => unit.id === g.spell?.targetId);
  const killed = g.spell.outcome === "hit" && !!target && target.hp <= 0;
  const xp =
    g.spell.outcome === "hit" && g.progressionRules.enabled
      ? g.progressionRules.xpPerHit + (killed ? g.progressionRules.xpPerKill : 0)
      : 0;
  return withXp(
    { ...g, phase: "player", spell: null, intent: "move" },
    g.units,
    xp,
    g.lastEvent,
    g.spell.casterId,
  );
}

export function setBattleMath(g: GameState, difficulty: Difficulty, answerMode: AnswerMode): GameState {
  return { ...g, difficulty, answerMode };
}

export function strikeDamage(attacker: Unit, defender: Unit, taken: readonly BuildId[], coverDefense: number): number {
  const terrain = TERRAIN[defender.row]?.[defender.col] ?? "plain";
  const bonus = defenseBonus({ side: defender.side, terrain, taken, coverDefense });
  return Math.max(1, attacker.atk - (defender.def + bonus));
}

export function dijkstra(origin: Unit, units: Unit[]): Reach {
  const cost = new Map<string, number>();
  const parent = new Map<string, string>();
  const start = tileKey(origin.col, origin.row);
  cost.set(start, 0);
  const queue = [start];
  while (queue.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < queue.length; index++) {
      if ((cost.get(queue[index]) ?? 99) < (cost.get(queue[bestIndex]) ?? 99)) bestIndex = index;
    }
    const current = queue.splice(bestIndex, 1)[0];
    const [col, row] = current.split(",").map(Number);
    const base = cost.get(current) ?? 0;
    for (const [dc, dr] of DIRS) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (!inBounds(nextCol, nextRow)) continue;
      if (TERRAIN[nextRow][nextCol] === "stone") continue;
      const occupant = at(units, nextCol, nextRow);
      if (occupant && occupant.id !== origin.id) continue;
      const step = TERRAIN[nextRow][nextCol] === "brush" ? 2 : 1;
      const nextCost = base + step;
      if (nextCost > origin.mov) continue;
      const code = tileKey(nextCol, nextRow);
      if (cost.has(code) && (cost.get(code) ?? 99) <= nextCost) continue;
      cost.set(code, nextCost);
      parent.set(code, current);
      queue.push(code);
    }
  }
  return { cost, parent };
}

function stepDistance(col: number, row: number, goals: Unit[], units: Unit[], selfId: string): number {
  const goalSet = new Set(goals.map((goal) => tileKey(goal.col, goal.row)));
  if (goalSet.size === 0) return 999;
  if (goalSet.has(tileKey(col, row))) return 0;
  const blocked = new Set(living(units).filter((unit) => unit.id !== selfId).map((unit) => tileKey(unit.col, unit.row)));
  const queue: Array<[number, number, number]> = [[col, row, 0]];
  const seen = new Set([tileKey(col, row)]);
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const [currentCol, currentRow, dist] = next;
    for (const [dc, dr] of DIRS) {
      const nextCol = currentCol + dc;
      const nextRow = currentRow + dr;
      if (!inBounds(nextCol, nextRow)) continue;
      const code = tileKey(nextCol, nextRow);
      if (seen.has(code)) continue;
      if (goalSet.has(code)) return dist + 1;
      if (TERRAIN[nextRow][nextCol] === "stone" || blocked.has(code)) continue;
      seen.add(code);
      queue.push([nextCol, nextRow, dist + 1]);
    }
  }
  return 999;
}

export function strikeTiles(actor: Unit, target: Unit, units: Unit[], reach: Reach): Array<Tile & { cost: number }> {
  const tiles: Array<Tile & { cost: number }> = [];
  for (const [dc, dr] of DIRS) {
    const col = target.col + dc;
    const row = target.row + dr;
    if (!inBounds(col, row)) continue;
    const code = tileKey(col, row);
    if (!reach.cost.has(code)) continue;
    const occupant = at(units, col, row);
    if (occupant && occupant.id !== actor.id) continue;
    tiles.push({ col, row, cost: reach.cost.get(code) ?? 0 });
  }
  tiles.sort((a, b) => a.cost - b.cost);
  return tiles;
}

export function pathTiles(reach: Reach, col: number, row: number): Tile[] {
  const dest = tileKey(col, row);
  if (!reach.cost.has(dest)) return [];
  const out: Tile[] = [];
  let cursor = dest;
  for (let guard = 0; guard < COLS * ROWS; guard++) {
    const [currentCol, currentRow] = cursor.split(",").map(Number);
    out.push({ col: currentCol, row: currentRow });
    const prev = reach.parent.get(cursor);
    if (!prev) break;
    cursor = prev;
  }
  out.reverse();
  return out;
}

function hereReach(unit: Unit): Reach {
  return { cost: new Map([[tileKey(unit.col, unit.row), 0]]), parent: new Map() };
}

function planMove(
  actor: Unit,
  units: Unit[],
  taken: readonly BuildId[],
  coverDefense: number,
): { col: number; row: number; targetId: string | null } {
  const reach = dijkstra(actor, units);
  let best: { score: number; cost: number; col: number; row: number; targetId: string } | null = null;
  for (const [code, cost] of reach.cost) {
    const [col, row] = code.split(",").map(Number);
    for (const [dc, dr] of DIRS) {
      const foe = at(units, col + dc, row + dr);
      if (!foe || foe.side === actor.side) continue;
      const dmg = strikeDamage(actor, foe, taken, coverDefense);
      const kill = foe.hp <= dmg ? 1 : 0;
      const score = kill * 100 + dmg * 10 + (20 - foe.hp);
      if (!best || score > best.score || (score === best.score && cost < best.cost)) {
        best = { score, cost, col, row, targetId: foe.id };
      }
    }
  }
  if (best) return { col: best.col, row: best.row, targetId: best.targetId };
  const foes = living(units).filter((unit) => unit.side !== actor.side);
  let approach = {
    col: actor.col,
    row: actor.row,
    dist: stepDistance(actor.col, actor.row, foes, units, actor.id),
    cost: 0,
  };
  for (const [code, cost] of reach.cost) {
    const [col, row] = code.split(",").map(Number);
    const dist = stepDistance(col, row, foes, units, actor.id);
    if (dist < approach.dist || (dist === approach.dist && cost < approach.cost)) {
      approach = { col, row, dist, cost };
    }
  }
  return { col: approach.col, row: approach.row, targetId: null };
}

interface StrikeResult {
  units: Unit[];
  text: string;
  xp: number;
}

function applyStrike(units: Unit[], attackerId: string, defenderId: string, g: GameState): StrikeResult {
  const attacker = units.find((unit) => unit.id === attackerId);
  const defender = units.find((unit) => unit.id === defenderId);
  if (!attacker || !defender) return { units, text: "", xp: 0 };
  const dmg = strikeDamage(attacker, defender, g.progression.taken, g.progressionRules.coverDefense);
  const hp = Math.max(0, defender.hp - dmg);
  const next = units.map((unit) => (unit.id === defenderId ? { ...unit, hp } : unit));
  const text =
    hp === 0
      ? `${attacker.name} strikes ${defender.name} for ${dmg}. ${defender.name} falls.`
      : `${attacker.name} strikes ${defender.name} for ${dmg}.`;
  const xp =
    attacker.side === "player" && g.progressionRules.enabled
      ? g.progressionRules.xpPerHit + (hp === 0 ? g.progressionRules.xpPerKill : 0)
      : 0;
  return { units: next, text, xp };
}

export function counterattack(
  col: number,
  row: number,
  mover: Unit,
  units: Unit[],
  taken: readonly BuildId[],
  coverDefense: number,
): { name: string; dmg: number } | null {
  const shifted = units.map((unit) => (unit.id === mover.id ? { ...unit, col, row } : unit));
  const standing = shifted.find((unit) => unit.id === mover.id);
  if (!standing) return null;
  let worst: { name: string; dmg: number } | null = null;
  for (const enemy of living(shifted)) {
    if (enemy.side !== "enemy") continue;
    const reach = dijkstra(enemy, shifted);
    if (strikeTiles(enemy, standing, shifted, reach).length === 0) continue;
    const dmg = strikeDamage(enemy, standing, taken, coverDefense);
    if (!worst || dmg > worst.dmg) worst = { name: enemy.name, dmg };
  }
  return worst;
}

function withPos(units: Unit[], id: string, col: number, row: number): Unit[] {
  return units.map((unit) => (unit.id === id ? { ...unit, col, row } : unit));
}

function withActed(units: Unit[], id: string): Unit[] {
  return units.map((unit) => (unit.id === id ? { ...unit, acted: true } : unit));
}

export function commandingUnit(g: GameState): Unit | null {
  if (g.phase !== "player") return null;
  const unit = g.units.find((candidate) => candidate.id === g.selectedId);
  if (!unit || unit.hp <= 0 || unit.side !== "player" || unit.acted) return null;
  return unit;
}

export function beginEnemy(g: GameState): GameState {
  if (g.phase !== "player") return g;
  return {
    ...g,
    phase: "enemy",
    selectedId: null,
    intent: "move",
    units: g.units.map((unit) => (unit.side === "enemy" ? { ...unit, acted: false } : unit)),
  };
}

function healWound(units: Unit[], times: number, amount: number): Unit[] {
  let next = units;
  for (let step = 0; step < times; step++) {
    const wounded = living(next)
      .filter((unit) => unit.side === "player" && unit.hp < unit.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!wounded) break;
    next = next.map((unit) =>
      unit.id === wounded.id ? { ...unit, hp: Math.min(unit.maxHp, unit.hp + amount) } : unit,
    );
  }
  return next;
}

function withXp(g: GameState, units: Unit[], xp: number, text: string, actedId: string): GameState {
  const gain = addCombatXp(g.progression, xp, g.progressionRules);
  const healed = healWound(withActed(units, actedId), gain.surplusHeals, g.progressionRules.healOnEmptyPool);
  const next: GameState = {
    ...g,
    units: healed,
    progression: gain.progression,
    selectedId: null,
    intent: "move",
    lastEvent: text,
  };
  if (gain.progression.pending.length > 0) return { ...next, phase: "level" };
  return settle(next);
}

function arrivalLine(round: number, placed: number, rules: PressureRules): string {
  const wave = waveForRound(round, rules);
  if (!wave || placed <= 0) return "The field is too tight for anyone else to step in.";
  if (wave.crowd) return `A crowd of ${placed} joins the field.`;
  if (wave.tier >= 3) return `${placed} tougher foes join the field.`;
  if (wave.tier >= 2) return `${placed} harder foes join the field.`;
  return placed === 1 ? "Another foe joins the field." : `${placed} more foes join the field.`;
}

function arrive(g: GameState): GameState {
  if (!g.pressure.enabled || g.spawnedRounds.includes(g.round)) return g;
  const wave = waveForRound(g.round, g.pressure);
  if (!wave) return g;
  const foes = planReinforcements({
    round: g.round,
    occupied: living(g.units).map((unit) => ({ col: unit.col, row: unit.row })),
    terrain: TERRAIN,
    rules: g.pressure,
    usedIds: new Set(g.units.map((unit) => unit.id)),
  });
  const units: Unit[] = [
    ...g.units,
    ...foes.map((foe) => ({
      id: foe.id,
      name: foe.name,
      role: foe.role,
      side: "enemy" as const,
      col: foe.col,
      row: foe.row,
      hp: foe.hp,
      maxHp: foe.maxHp,
      atk: foe.atk,
      def: foe.def,
      mov: foe.mov,
      acted: false,
      tier: foe.tier,
    })),
  ];
  return {
    ...g,
    units,
    spawnedRounds: [...g.spawnedRounds, g.round],
    lastEvent: arrivalLine(g.round, foes.length, g.pressure),
  };
}

export function withCrowd(g: GameState): GameState {
  const wave = g.pressure.waves.find((item) => item.crowd);
  if (!wave) return g;
  return arrive({
    ...g,
    round: wave.round,
    phase: "player",
    winner: null,
    selectedId: null,
    intent: "move",
    spawnedRounds: g.spawnedRounds.filter((round) => round !== wave.round),
    units: g.units.map((unit) => ({ ...unit, acted: false })),
  });
}

function settle(g: GameState): GameState {
  const winner = winnerOf(g);
  if (winner) return { ...g, phase: "victory", winner, selectedId: null, intent: "move" };
  const ready = g.units.some((unit) => unit.side === "player" && unit.hp > 0 && !unit.acted);
  if (!ready) return beginEnemy(g);
  return g;
}

function finishEnemy(g: GameState): GameState {
  const units = g.units.map((unit) => (unit.side === "player" ? { ...unit, acted: false } : unit));
  const wiped = winnerOf({ ...g, units });
  if (wiped === "enemy") {
    return { ...g, units, phase: "victory", winner: "enemy", selectedId: null, intent: "move", enemyStep: g.enemyStep + 1 };
  }
  const arrived = arrive({
    ...g,
    units,
    phase: "player",
    winner: null,
    selectedId: null,
    intent: "move",
    round: g.round + 1,
    enemyStep: g.enemyStep + 1,
  });
  const winner = winnerOf(arrived);
  if (winner) return { ...arrived, phase: "victory", winner, selectedId: null, intent: "move" };
  return arrived;
}

export function stepEnemy(g: GameState): GameState {
  if (g.phase !== "enemy") return g;
  const already = winnerOf(g);
  if (already) {
    return { ...g, phase: "victory", winner: already, selectedId: null, intent: "move", enemyStep: g.enemyStep + 1 };
  }
  const players = living(g.units).filter((unit) => unit.side === "player");
  const ready = living(g.units)
    .filter((unit) => unit.side === "enemy" && !unit.acted)
    .sort((a, b) => {
      const da = stepDistance(a.col, a.row, players, g.units, a.id);
      const db = stepDistance(b.col, b.row, players, g.units, b.id);
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name);
    });
  const actor = ready[0];
  if (!actor) return finishEnemy(g);
  const plan = planMove(actor, g.units, g.progression.taken, g.progressionRules.coverDefense);
  let units = withPos(g.units, actor.id, plan.col, plan.row);
  let lastEvent = plan.col !== actor.col || plan.row !== actor.row ? `${actor.name} advances.` : `${actor.name} holds.`;
  if (plan.targetId) {
    const hit = applyStrike(units, actor.id, plan.targetId, g);
    units = hit.units;
    lastEvent = hit.text;
  }
  units = withActed(units, actor.id);
  const winner = winnerOf({ ...g, units });
  if (winner) {
    return { ...g, units, phase: "victory", winner, selectedId: null, intent: "move", lastEvent, enemyStep: g.enemyStep + 1 };
  }
  return { ...g, units, lastEvent, enemyStep: g.enemyStep + 1 };
}

export function chooseBuild(g: GameState, id: BuildId): GameState {
  if (g.phase !== "level") return g;
  const offer = g.progression.pending.find((item) => item.id === id);
  if (!offer) return g;
  const accepted = acceptBuild(g.progression, id);
  if (!accepted) return g;
  const units = healWound(applyBuildToUnits(g.units, id), accepted.surplusHeals, g.progressionRules.healOnEmptyPool);
  const next: GameState = {
    ...g,
    units,
    progression: accepted.progression,
    phase: "player",
    lastEvent: `${offer.name} taken.`,
  };
  if (accepted.progression.pending.length > 0) return { ...next, phase: "level" };
  return settle(next);
}

export function scriptedStep(g: GameState): GameState {
  if (g.phase !== "player") return g;
  const actor = g.units.find((unit) => unit.side === "player" && unit.hp > 0 && !unit.acted);
  if (!actor) return g;
  const selected = clickTile(g, actor.col, actor.row);
  const reach = selectionReach(selected);
  const keys = [...moveKeysFor(selected, reach)];
  if (keys.length === 0) return selected;
  const [col, row] = keys[0].split(",").map(Number);
  return clickTile(selected, col, row);
}

export function clickTile(g: GameState, col: number, row: number): GameState {
  if (g.phase === "victory" || g.phase === "level" || g.phase === "cast") return g;
  const occupant = at(g.units, col, row);
  if (g.phase === "enemy") return occupant ? { ...g, selectedId: occupant.id } : g;
  const actor = commandingUnit(g);
  if (actor && g.intent === "cast") {
    if (occupant?.id === actor.id) return { ...g, intent: "move", lastEvent: `${actor.name} holds the spell.` };
    if (occupant && occupant.side === "enemy" && inSpellRange(actor, occupant)) return beginCast(g, occupant.id);
    return g;
  }
  if (actor && g.intent === "strike") {
    if (occupant?.id === actor.id) {
      return settle({
        ...g,
        units: withActed(g.units, actor.id),
        selectedId: null,
        intent: "move",
        lastEvent: `${actor.name} holds.`,
      });
    }
    if (occupant && occupant.side === "enemy" && Math.abs(occupant.col - actor.col) + Math.abs(occupant.row - actor.row) === 1) {
      const hit = applyStrike(g.units, actor.id, occupant.id, g);
      return withXp(g, hit.units, hit.xp, hit.text, actor.id);
    }
    return g;
  }
  if (occupant && occupant.side === "player" && !occupant.acted) {
    if (actor?.id === occupant.id) return { ...g, selectedId: null };
    return { ...g, selectedId: occupant.id, intent: "move" };
  }
  if (actor && g.intent === "move") {
    const reach = dijkstra(actor, g.units);
    const code = tileKey(col, row);
    if (!occupant && reach.cost.has(code) && code !== tileKey(actor.col, actor.row)) {
      const units = withPos(g.units, actor.id, col, row);
      const moved = units.find((unit) => unit.id === actor.id);
      if (!moved) return g;
      const foes = living(units).filter(
        (unit) => unit.side === "enemy" && Math.abs(unit.col - moved.col) + Math.abs(unit.row - moved.row) === 1,
      );
      if (foes.length > 0) {
        return { ...g, units, selectedId: actor.id, intent: "strike", lastEvent: `${actor.name} can strike.` };
      }
      const spellReady =
        g.casters.includes(actor.id) &&
        living(units).some((unit) => unit.side === "enemy" && inSpellRange(moved, unit));
      if (spellReady) {
        return { ...g, units, selectedId: actor.id, intent: "cast", lastEvent: `${actor.name} can cast.` };
      }
      return settle({
        ...g,
        units: withActed(units, actor.id),
        selectedId: null,
        intent: "move",
        lastEvent: `${actor.name} moves.`,
      });
    }
    if (occupant && occupant.side === "enemy") {
      const stand = strikeTiles(actor, occupant, g.units, reach)[0];
      if (stand) {
        const units = withPos(g.units, actor.id, stand.col, stand.row);
        const hit = applyStrike(units, actor.id, occupant.id, g);
        return withXp(g, hit.units, hit.xp, hit.text, actor.id);
      }
    }
  }
  if (!actor && occupant) return { ...g, selectedId: occupant.id, intent: "move" };
  return g;
}

export function pickUnit(g: GameState, id: string): GameState {
  const unit = g.units.find((candidate) => candidate.id === id);
  if (!unit) return g;
  if (unit.hp <= 0) {
    if (g.phase === "player" && g.intent === "strike" && commandingUnit(g)) return g;
    return { ...g, selectedId: id };
  }
  return clickTile(g, unit.col, unit.row);
}

export function promptFor(g: GameState): string | null {
  if (g.phase === "victory") return null;
  if (g.phase === "cast" && g.spell) {
    if (g.spell.outcome === "fizzle") return "Fizzle.";
    if (g.spell.outcome === "hit") return `Spark deals ${g.spell.damage}.`;
    return g.spell.problem.caption;
  }
  if (g.phase === "level") return "Choose one skill or item. The turn waits.";
  if (g.phase === "enemy") return "Ash host is moving.";
  const actor = commandingUnit(g);
  if (actor && g.intent === "cast") return "Click a foe to cast Spark.";
  if (actor && g.intent === "strike") return "Click a foe in a red ring to strike, or click this unit again to hold.";
  if (actor) return "Click a highlighted tile to move, or a foe in a red ring to strike.";
  return "Click an Amber unit.";
}

export function statusOf(unit: Unit, g: GameState): string {
  if (unit.hp <= 0) return "Down";
  if (g.selectedId === unit.id && g.intent === "strike" && g.phase === "player" && unit.side === "player" && !unit.acted) {
    return "Strike";
  }
  const theirTurn = (g.phase === "player" && unit.side === "player") || (g.phase === "enemy" && unit.side === "enemy");
  if (theirTurn) return unit.acted ? "Done" : "Ready";
  return "In play";
}

export function describeHover(args: {
  hover: Tile;
  units: Unit[];
  commanding: Unit | null;
  intent: Intent;
  reach: Reach;
  attackIds: Set<string>;
  taken?: readonly BuildId[];
  coverDefense?: number;
}): string | null {
  const { hover, units, commanding, intent, reach, attackIds } = args;
  const taken = args.taken ?? [];
  const coverDefense = args.coverDefense ?? PROGRESSION_DEFAULTS.coverDefense;
  const unit = at(units, hover.col, hover.row);
  const terrain = TERRAIN[hover.row][hover.col];
  const code = tileKey(hover.col, hover.row);
  const bits: string[] = [];
  if (unit) {
    const tier = unit.tier ? `, tier ${unit.tier}` : "";
    bits.push(`${unit.name}, ${unit.role}, ${unit.hp}/${unit.maxHp}${tier}`);
  }
  if (commanding && unit && attackIds.has(unit.id)) {
    if (intent === "cast") bits.push("Spark. The answer is the damage.");
    else {
      const dmg = strikeDamage(commanding, unit, taken, coverDefense);
      bits.push(unit.hp <= dmg ? `Strike deals ${dmg}, a killing blow` : `Strike deals ${dmg}`);
    }
  }
  const inRange =
    commanding !== null && intent === "move" && !unit && reach.cost.has(code) && code !== tileKey(commanding.col, commanding.row);
  if (terrain === "stone") bits.push("Blocks movement");
  else if (inRange) bits.push(`Costs ${reach.cost.get(code)} movement`);
  else if (terrain === "brush") bits.push("Brush costs 2 movement");
  if (terrain === "brush" && taken.includes("brush-cover") && (!unit || unit.side === "player")) {
    bits.push(`Brush cover adds ${coverDefense} defense`);
  }
  if (commanding && (!unit || unit.id === commanding.id)) {
    const here = commanding.col === hover.col && commanding.row === hover.row;
    if (here || inRange) {
      const threat = counterattack(hover.col, hover.row, commanding, units, taken, coverDefense);
      if (threat) bits.push(`${threat.name} can strike here for ${threat.dmg}`);
    }
  }
  if (bits.length === 0) return null;
  return bits.join(" · ");
}

export function selectionReach(g: GameState): Reach {
  const commanding = commandingUnit(g);
  if (!commanding || g.intent !== "move") return EMPTY_REACH;
  return dijkstra(commanding, g.units);
}

export function attackIdsFor(g: GameState, reach: Reach): Set<string> {
  const ids = new Set<string>();
  const commanding = commandingUnit(g);
  if (!commanding) return ids;
  if (g.intent === "cast") {
    for (const id of spellTargetIds(g)) ids.add(id);
    return ids;
  }
  const reachForStrike = g.intent === "strike" ? hereReach(commanding) : reach;
  for (const foe of living(g.units)) {
    if (foe.side === "enemy" && strikeTiles(commanding, foe, g.units, reachForStrike).length > 0) ids.add(foe.id);
  }
  return ids;
}

export function moveKeysFor(g: GameState, reach: Reach): Set<string> {
  const keys = new Set<string>();
  const commanding = commandingUnit(g);
  if (!commanding || g.intent !== "move") return keys;
  const origin = tileKey(commanding.col, commanding.row);
  for (const code of reach.cost.keys()) {
    if (code !== origin) keys.add(code);
  }
  return keys;
}

export function hoverPath(g: GameState, hover: Tile | null, reach: Reach, attackIds: Set<string>): Tile[] {
  const commanding = commandingUnit(g);
  if (!hover || !commanding || g.intent !== "move") return [];
  const occupant = at(g.units, hover.col, hover.row);
  if (occupant && attackIds.has(occupant.id)) {
    const stand = strikeTiles(commanding, occupant, g.units, reach)[0];
    if (!stand || (stand.col === commanding.col && stand.row === commanding.row)) return [];
    return pathTiles(reach, stand.col, stand.row);
  }
  const code = tileKey(hover.col, hover.row);
  if (!reach.cost.has(code) || code === tileKey(commanding.col, commanding.row)) return [];
  return pathTiles(reach, hover.col, hover.row);
}
