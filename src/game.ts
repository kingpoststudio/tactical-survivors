import { gradeAnswer, makeProblem, makeStrikeProblem, SPELL_RANGE, type AnswerMode, type Difficulty, type MathProblem } from "./mathcast.ts";
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
export type Intent = "move" | "act" | "strike" | "cast";
export type ActionKind = "bump" | "spark" | "ember" | "flare";
export type Terrain = "plain" | "brush" | "stone";

export interface SpellCast {
  kind: ActionKind;
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
  /** Equipped fire ability. Favors a sorceress, and any class can wear it. */
  ability?: "ember" | "flare" | null;
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
  /** Tiles still left to step onto, one orthogonal tile at a time. */
  walk: Tile[];
  /** Enemy whose problem is on screen. */
  focusId: string | null;
  /** The move is finished, so Wait can end the turn. */
  committed: boolean;
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
    walk: [],
    focusId: null,
    committed: false,
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

function beside(a: Pick<Unit, "col" | "row">, b: Pick<Unit, "col" | "row">): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

export function bumpTargets(g: GameState, actor: Unit): Unit[] {
  return living(g.units).filter((unit) => unit.side === "enemy" && beside(actor, unit));
}

function foesInReach(actor: Unit, units: Unit[]): Unit[] {
  return living(units).filter((unit) => unit.side === "enemy" && inSpellRange(actor, unit));
}

export function sparkTargets(g: GameState, actor: Unit): Unit[] {
  if (!g.casters.includes(actor.id)) return [];
  return foesInReach(actor, g.units);
}

export function emberTargets(g: GameState, actor: Unit): Unit[] {
  if (actor.ability !== "ember") return [];
  return foesInReach(actor, g.units);
}

export function flareTargets(g: GameState, actor: Unit): Unit[] {
  if (actor.ability !== "flare") return [];
  return foesInReach(actor, g.units);
}

function readyStriker(g: GameState): Unit | null {
  return living(g.units).find((unit) => unit.side === "player" && !unit.acted) ?? null;
}

function openProblem(g: GameState, actor: Unit, foe: Unit, kind: ActionKind): SpellCast {
  const problem =
    kind === "bump"
      ? makeStrikeProblem(strikeDamage(actor, foe, g.progression.taken, g.progressionRules.coverDefense), g.random)
      : makeProblem(g.difficulty, g.random);
  return { kind, casterId: actor.id, targetId: foe.id, problem, outcome: "open", given: null, damage: 0 };
}

/** The problem can be answered. A preview stays on screen either way. */
export function mathReady(g: GameState): boolean {
  const spell = g.spell;
  if (!spell || spell.outcome !== "open") return false;
  if (g.phase !== "player" && g.phase !== "cast") return false;
  const actor = g.units.find((unit) => unit.id === spell.casterId);
  const foe = living(g.units).find((unit) => unit.id === spell.targetId && unit.side === "enemy");
  if (!actor || !foe || actor.hp <= 0 || actor.acted || actor.side !== "player") return false;
  if (g.selectedId !== actor.id) return false;
  if (spell.kind === "bump") return beside(actor, foe);
  if (spell.kind === "ember") return actor.ability === "ember" && inSpellRange(actor, foe);
  if (spell.kind === "flare") return actor.ability === "flare" && inSpellRange(actor, foe);
  return g.casters.includes(actor.id) && inSpellRange(actor, foe);
}

export function showFoe(g: GameState, id: string): GameState {
  const foe = living(g.units).find((unit) => unit.id === id && unit.side === "enemy");
  if (!foe) return g;
  const actor = g.phase === "player" ? commandingUnit(g) : null;
  const striker = actor ?? readyStriker(g);
  if (!striker) return { ...g, focusId: id, selectedId: id };
  const sparkOk = !!actor && sparkTargets(g, actor).some((unit) => unit.id === id);
  const emberOk = !!actor && emberTargets(g, actor).some((unit) => unit.id === id);
  const flareOk = !!actor && flareTargets(g, actor).some((unit) => unit.id === id);
  const bumpOk = !!actor && bumpTargets(g, actor).some((unit) => unit.id === id);
  const kind: ActionKind = sparkOk && !bumpOk ? "spark" : emberOk && !bumpOk ? "ember" : flareOk && !bumpOk ? "flare" : "bump";
  return {
    ...g,
    selectedId: actor ? actor.id : id,
    focusId: id,
    spell: openProblem(g, striker, foe, kind),
  };
}

function presentChoice(g: GameState): GameState {
  const actor = commandingUnit(g);
  if (!actor) return g;
  const bumps = bumpTargets(g, actor);
  const sparks = sparkTargets(g, actor);
  const embers = emberTargets(g, actor);
  const flares = flareTargets(g, actor);
  if (bumps.length === 0 && sparks.length === 0 && embers.length === 0 && flares.length === 0) {
    return settle({
      ...g,
      units: withActed(g.units, actor.id),
      selectedId: null,
      focusId: null,
      spell: null,
      intent: "move",
      walk: [],
      committed: false,
    });
  }
  const kind: ActionKind = bumps.length > 0 ? "bump" : sparks.length > 0 ? "spark" : embers.length > 0 ? "ember" : "flare";
  const foe = (kind === "bump" ? bumps : kind === "spark" ? sparks : kind === "ember" ? embers : flares)[0];
  return {
    ...g,
    intent: "act",
    committed: true,
    selectedId: actor.id,
    focusId: foe.id,
    walk: [],
    spell: openProblem(g, actor, foe, kind),
  };
}

export function chooseAction(g: GameState, kind: ActionKind | "wait"): GameState {
  if (g.walk.length > 0) return g;
  if (g.phase === "victory" || g.phase === "level" || g.phase === "enemy") return g;
  const base = g.phase === "cast" && g.spell?.outcome === "open" ? { ...g, phase: "player" as const } : g;
  if (base.phase !== "player") return g;
  const actor = commandingUnit(base);
  if (!actor) return g;
  if (kind === "wait") {
    if (!base.committed && base.intent !== "act") return base;
    return settle({
      ...base,
      units: withActed(base.units, actor.id),
      selectedId: null,
      focusId: null,
      spell: null,
      intent: "move",
      walk: [],
      committed: false,
    });
  }
  const targets =
    kind === "bump"
      ? bumpTargets(base, actor)
      : kind === "ember"
        ? emberTargets(base, actor)
        : kind === "flare"
          ? flareTargets(base, actor)
          : sparkTargets(base, actor);
  if (targets.length === 0) return g;
  const foe = targets.find((unit) => unit.id === base.focusId) ?? targets[0];
  return {
    ...base,
    intent: base.committed ? "act" : base.intent,
    selectedId: actor.id,
    focusId: foe.id,
    spell: openProblem(base, actor, foe, kind),
  };
}

export function beginCast(g: GameState, targetId: string, _rng: () => number = g.random): GameState {
  void _rng;
  return chooseAction({ ...g, focusId: targetId }, "spark");
}

export function armCast(g: GameState, _rng: () => number = g.random): GameState {
  void _rng;
  return chooseAction(g, "spark");
}

export function answerCast(g: GameState, given: number): GameState {
  if (!g.spell || g.spell.outcome !== "open" || !mathReady(g)) return g;
  const verdict = gradeAnswer(g.spell.problem, given);
  if (!verdict) return g;
  const caster = g.units.find((unit) => unit.id === g.spell?.casterId);
  const target = g.units.find((unit) => unit.id === g.spell?.targetId);
  if (!caster || !target) return g;
  const prompt = g.spell.problem.prompt;
  const name = g.spell.kind === "bump" ? "Bump" : g.spell.kind === "ember" ? "Ember" : g.spell.kind === "flare" ? "Flare" : "Spark";
  if (!verdict.correct) {
    return {
      ...g,
      phase: "cast",
      spell: { ...g.spell, outcome: "fizzle", given, damage: verdict.damage },
      lastEvent: `${caster.name} ${name}. ${prompt}. Fizzle.`,
    };
  }
  const damage = g.spell.problem.answer;
  const hp = Math.max(0, target.hp - damage);
  const units = g.units.map((unit) => (unit.id === target.id ? { ...unit, hp } : unit));
  const lastEvent =
    hp === 0
      ? `${caster.name} ${name}. ${prompt} = ${damage}. ${target.name} falls.`
      : `${caster.name} ${name}. ${prompt} = ${damage}. ${target.name} takes ${damage}.`;
  return {
    ...g,
    phase: "cast",
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
    { ...g, phase: "player", spell: null, intent: "move", focusId: null, walk: [], committed: false },
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
    focusId: null,
    spell: null,
    walk: [],
    committed: false,
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
    focusId: null,
    spell: null,
    walk: [],
    committed: false,
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
  return finishWalk(clickTile(selected, col, row));
}

export function stepWalk(g: GameState): GameState {
  if (g.phase !== "player" || g.walk.length === 0) return g;
  const actor = commandingUnit(g);
  if (!actor) return { ...g, walk: [] };
  const step = g.walk[0];
  const orthogonal = Math.abs(step.col - actor.col) + Math.abs(step.row - actor.row) === 1;
  const blocked = !orthogonal || !inBounds(step.col, step.row) || TERRAIN[step.row][step.col] === "stone";
  const occupant = at(g.units, step.col, step.row);
  if (blocked || (occupant && occupant.id !== actor.id)) return { ...g, walk: [] };
  const units = withPos(g.units, actor.id, step.col, step.row);
  const rest = g.walk.slice(1);
  if (rest.length > 0) {
    return { ...g, units, walk: rest, spell: null, focusId: null };
  }
  return presentChoice({ ...g, units, walk: [] });
}

/** How long a step stays on screen. Fast-forward only changes this delay. */
export function presentationDelay(kind: "walk" | "enemy", fast: boolean): number {
  if (kind === "walk") return fast ? 40 : 260;
  return fast ? 80 : 640;
}

/** Advance a walk or an enemy step. An open math prompt stays open. */
export function presentStep(g: GameState): GameState {
  if (g.phase === "cast" || g.spell?.outcome === "open") return g;
  if (g.phase === "player" && g.walk.length > 0) return stepWalk(g);
  if (g.phase === "enemy") return stepEnemy(g);
  return g;
}

export function finishWalk(g: GameState): GameState {
  let next = g;
  for (let guard = 0; next.walk.length > 0 && guard < COLS * ROWS; guard++) {
    const stepped = stepWalk(next);
    if (stepped === next) break;
    next = stepped;
  }
  return next;
}

export function clickTile(g: GameState, col: number, row: number): GameState {
  if (g.phase === "victory" || g.phase === "level") return g;
  if (g.walk.length > 0) return g;
  const occupant = at(g.units, col, row);
  if (g.phase === "cast") {
    if (g.spell?.outcome === "open" && occupant?.side === "enemy") return showFoe({ ...g, phase: "player" }, occupant.id);
    return g;
  }
  if (g.phase === "enemy") {
    if (!occupant) return g;
    if (occupant.side === "enemy") return showFoe(g, occupant.id);
    return { ...g, selectedId: occupant.id, focusId: null, spell: null };
  }
  const actor = commandingUnit(g);
  if (occupant?.side === "enemy") return showFoe(g, occupant.id);
  if (occupant && occupant.side === "player" && !occupant.acted) {
    if (actor?.id === occupant.id) {
      if (
        g.committed ||
        bumpTargets(g, actor).length > 0 ||
        sparkTargets(g, actor).length > 0 ||
        emberTargets(g, actor).length > 0 ||
        flareTargets(g, actor).length > 0
      ) {
        return presentChoice(g);
      }
      return { ...g, selectedId: null, focusId: null, spell: null, intent: "move", committed: false };
    }
    const picked = { ...g, selectedId: occupant.id };
    const bumps = bumpTargets(picked, occupant);
    const sparks = sparkTargets(picked, occupant);
    const embers = emberTargets(picked, occupant);
    const flares = flareTargets(picked, occupant);
    const next: GameState = {
      ...g,
      selectedId: occupant.id,
      intent: "move",
      walk: [],
      committed: false,
      focusId: null,
      spell: null,
    };
    if (bumps.length === 0 && sparks.length === 0 && embers.length === 0 && flares.length === 0) return next;
    const kind: ActionKind = bumps.length > 0 ? "bump" : sparks.length > 0 ? "spark" : embers.length > 0 ? "ember" : "flare";
    const foe = (kind === "bump" ? bumps : kind === "spark" ? sparks : kind === "ember" ? embers : flares)[0];
    return { ...next, focusId: foe.id, spell: openProblem(next, occupant, foe, kind) };
  }
  if (actor && g.intent === "move" && !g.committed && !occupant) {
    const reach = dijkstra(actor, g.units);
    const code = tileKey(col, row);
    if (reach.cost.has(code) && code !== tileKey(actor.col, actor.row)) {
      const path = pathTiles(reach, col, row).slice(1);
      if (path.length === 0) return g;
      return { ...g, walk: path, spell: null, focusId: null, selectedId: actor.id };
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
  if (g.spell && g.spell.outcome !== "open") {
    if (g.spell.outcome === "fizzle") return "Fizzle.";
    return String(g.spell.damage);
  }
  if (g.spell?.outcome === "open") return g.spell.problem.prompt;
  if (g.phase === "level") return "Choose one skill or item. The turn waits.";
  if (g.phase === "enemy") return "Ash host is moving.";
  if (g.walk.length > 0) return "";
  const actor = commandingUnit(g);
  if (actor && g.intent === "act") return "";
  if (actor) return "";
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
  if (commanding && unit && attackIds.has(unit.id) && intent === "cast") {
    bits.push(String(unit.hp));
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
  if (!commanding || g.intent !== "move" || g.committed || g.walk.length > 0) return EMPTY_REACH;
  return dijkstra(commanding, g.units);
}

export function attackIdsFor(g: GameState, _reach: Reach): Set<string> {
  const ids = new Set<string>();
  if (g.focusId) ids.add(g.focusId);
  const commanding =
    commandingUnit(g) ??
    (g.spell
      ? living(g.units).find((unit) => unit.id === g.spell?.casterId && unit.side === "player" && !unit.acted) ?? null
      : null);
  if (!commanding) return ids;
  const kind = g.spell?.kind;
  if (kind === "spark") {
    for (const foe of sparkTargets(g, commanding)) ids.add(foe.id);
    return ids;
  }
  if (kind === "ember") {
    for (const foe of emberTargets(g, commanding)) ids.add(foe.id);
    return ids;
  }
  if (kind === "flare") {
    for (const foe of flareTargets(g, commanding)) ids.add(foe.id);
    return ids;
  }
  if (kind === "bump" || g.intent === "act" || g.phase === "cast") {
    for (const foe of bumpTargets(g, commanding)) ids.add(foe.id);
    if (!kind || kind === "bump") {
      if (g.intent === "act" || g.phase === "cast") {
        for (const foe of sparkTargets(g, commanding)) ids.add(foe.id);
        for (const foe of emberTargets(g, commanding)) ids.add(foe.id);
        for (const foe of flareTargets(g, commanding)) ids.add(foe.id);
      }
    }
    return ids;
  }
  return ids;
}

export function moveKeysFor(g: GameState, reach: Reach): Set<string> {
  const keys = new Set<string>();
  const commanding = commandingUnit(g);
  if (!commanding || g.intent !== "move" || g.committed || g.walk.length > 0) return keys;
  const origin = tileKey(commanding.col, commanding.row);
  for (const code of reach.cost.keys()) {
    if (code !== origin) keys.add(code);
  }
  return keys;
}

export function rangeKeys(g: GameState): { move: string[]; attack: string[]; ability: string[] } {
  const reach = selectionReach(g);
  const actor = commandingUnit(g);
  const move = [...moveKeysFor(g, reach)];
  if (!actor) return { move, attack: [], ability: [] };
  const attack = bumpTargets(g, actor).map((unit) => tileKey(unit.col, unit.row));
  const ability = [...sparkTargets(g, actor), ...emberTargets(g, actor), ...flareTargets(g, actor)].map((unit) =>
    tileKey(unit.col, unit.row),
  );
  return { move, attack, ability };
}

export function turnOrder(g: GameState): { id: string; side: Side }[] {
  const players = living(g.units)
    .filter((unit) => unit.side === "player" && !unit.acted)
    .sort((a, b) => (ROSTER_ORDER.get(a.id) ?? 99) - (ROSTER_ORDER.get(b.id) ?? 99));
  const enemies = living(g.units)
    .filter((unit) => unit.side === "enemy")
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return [...players, ...enemies].map((unit) => ({ id: unit.id, side: unit.side }));
}

/** The problem that would open. It does not change HP or the open prompt. */
export function previewAction(g: GameState, kind: ActionKind): { prompt: string; answer: number } | null {
  const actor = commandingUnit(g);
  if (!actor) return null;
  const foes =
    kind === "bump"
      ? bumpTargets(g, actor)
      : kind === "spark"
        ? sparkTargets(g, actor)
        : kind === "ember"
          ? emberTargets(g, actor)
          : kind === "flare"
            ? flareTargets(g, actor)
            : [];
  const foe = foes[0];
  if (!foe) return null;
  const problem =
    kind === "bump"
      ? makeStrikeProblem(strikeDamage(actor, foe, g.progression.taken, g.progressionRules.coverDefense), g.random)
      : makeProblem(g.difficulty, g.random);
  return { prompt: problem.prompt, answer: problem.answer };
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
