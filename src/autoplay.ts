import {
  attackIdsFor,
  beginEnemy,
  chooseBuild,
  clickTile,
  counterattack,
  createBattle,
  living,
  moveKeysFor,
  selectionReach,
  stepEnemy,
  strikeDamage,
  strikeTiles,
  type GameState,
  type Unit,
} from "./game.ts";
import type { BuildId } from "./progression.ts";

const PREFER: readonly BuildId[] = ["focused-strike", "ward-plate", "brush-cover", "field-kit", "long-stride"];

export interface PlayResult {
  state: GameState;
  actions: number;
  events: string[];
}

function foeDistance(col: number, row: number, units: Unit[]): number {
  const foes = living(units).filter((unit) => unit.side === "enemy");
  if (foes.length === 0) return 0;
  return Math.min(...foes.map((unit) => Math.abs(unit.col - col) + Math.abs(unit.row - row)));
}

function remember(events: string[], state: GameState) {
  const line = `r${state.round} ${state.phase} ${state.lastEvent}`.trim();
  if (line && events[events.length - 1] !== line) events.push(line);
}

function act(g: GameState): GameState {
  if (g.phase === "level") {
    const pick = PREFER.find((id) => g.progression.pending.some((offer) => offer.id === id)) ?? g.progression.pending[0]?.id;
    return pick ? chooseBuild(g, pick) : g;
  }
  if (g.phase !== "player") return g;
  const ready = g.units.filter((unit) => unit.side === "player" && unit.hp > 0 && !unit.acted);
  let best: { score: number; apply: () => GameState } | null = null;
  for (const actor of ready) {
    const selected = g.selectedId === actor.id ? g : clickTile(g, actor.col, actor.row);
    if (selected.phase !== "player") return selected;
    const reach = selectionReach(selected);
    for (const id of attackIdsFor(selected, reach)) {
      const foe = selected.units.find((unit) => unit.id === id);
      if (!foe || foe.hp <= 0) continue;
      const stand = strikeTiles(actor, foe, selected.units, reach)[0];
      const col = stand?.col ?? actor.col;
      const row = stand?.row ?? actor.row;
      const dmg = strikeDamage(actor, foe, selected.progression.taken, selected.progressionRules.coverDefense);
      const kill = foe.hp <= dmg;
      const after = kill ? selected.units.map((unit) => (unit.id === foe.id ? { ...unit, hp: 0 } : unit)) : selected.units;
      const threat = counterattack(col, row, actor, after, selected.progression.taken, selected.progressionRules.coverDefense)?.dmg ?? 0;
      if (threat >= actor.hp) continue;
      const score = (kill ? 800 : 420) + dmg * 10 - threat * 20;
      if (!best || score > best.score) best = { score, apply: () => clickTile(selected, foe.col, foe.row) };
    }
    const here = foeDistance(actor.col, actor.row, selected.units);
    const hereThreat = counterattack(actor.col, actor.row, actor, selected.units, selected.progression.taken, selected.progressionRules.coverDefense)?.dmg ?? 0;
    for (const code of moveKeysFor(selected, reach)) {
      const [col, row] = code.split(",").map(Number);
      const dist = foeDistance(col, row, selected.units);
      const threat = counterattack(col, row, actor, selected.units, selected.progression.taken, selected.progressionRules.coverDefense)?.dmg ?? 0;
      if (threat > 0) continue;
      const neighbors = living(selected.units).filter(
        (unit) => unit.side === "enemy" && Math.abs(unit.col - col) + Math.abs(unit.row - row) === 1,
      ).length;
      if (neighbors > 1) continue;
      const safer = hereThreat > 0 && dist >= here;
      const closer = hereThreat === 0 && dist < here && neighbors === 0;
      if (!safer && !closer) continue;
      const score = safer ? 100 + dist : 40 - dist;
      if (!best || score > best.score) best = { score, apply: () => clickTile(selected, col, row) };
    }
  }
  if (best) return best.apply();
  return beginEnemy(g);
}

function finishEnemies(g: GameState): GameState {
  let next = g;
  for (let guard = 0; next.phase === "enemy" && guard < 80; guard++) next = stepEnemy(next);
  return next;
}

export function playFight(start: GameState = createBattle()): PlayResult {
  return play(start, false);
}

export function playIdle(start: GameState = createBattle()): PlayResult {
  return play(start, true);
}

export function stepBattle(g: GameState): GameState {
  if (g.phase === "enemy") return stepEnemy(g);
  if (g.phase === "victory" || g.phase === "cast") return g;
  return act(g);
}

function play(start: GameState, idle: boolean): PlayResult {
  let state = start;
  const events: string[] = [];
  let actions = 0;
  while (state.phase !== "victory" && actions < 600) {
    const before = state;
    state = state.phase === "enemy" ? finishEnemies(state) : idle ? beginEnemy(state) : act(state);
    actions += 1;
    remember(events, state);
    if (state.round !== before.round || state.phase === "victory") {
      const amber = living(state.units)
        .filter((unit) => unit.side === "player")
        .map((unit) => `${unit.name} ${unit.hp}`)
        .join(", ");
      const foes = living(state.units).filter((unit) => unit.side === "enemy").length;
      events.push(`board r${state.round} foes ${foes} amber ${amber || "down"}`);
    }
    if (state === before) break;
  }
  const foes = living(state.units).filter((unit) => unit.side === "enemy").length;
  const amber = living(state.units).filter((unit) => unit.side === "player").length;
  events.push(`end ${state.phase} winner ${state.winner ?? "none"} round ${state.round} amber ${amber} foes ${foes}`);
  return { state, actions, events };
}
