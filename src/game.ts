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
export type Phase = "player" | "enemy" | "victory";
export type Intent = "move" | "strike";
export type Terrain = "plain" | "brush" | "stone";

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

export function createBattle(): GameState {
  return {
    units: ROSTER.map((unit) => ({ ...unit, hp: unit.maxHp, acted: false })),
    phase: "player",
    winner: null,
    selectedId: null,
    intent: "move",
    round: 1,
    lastEvent: "",
    enemyStep: 0,
  };
}

export function winnerOf(units: Unit[]): Side | null {
  const players = living(units).some((unit) => unit.side === "player");
  const enemies = living(units).some((unit) => unit.side === "enemy");
  if (players && enemies) return null;
  return players ? "player" : "enemy";
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

function planMove(actor: Unit, units: Unit[]): { col: number; row: number; targetId: string | null } {
  const reach = dijkstra(actor, units);
  let best: { score: number; cost: number; col: number; row: number; targetId: string } | null = null;
  for (const [code, cost] of reach.cost) {
    const [col, row] = code.split(",").map(Number);
    for (const [dc, dr] of DIRS) {
      const foe = at(units, col + dc, row + dr);
      if (!foe || foe.side === actor.side) continue;
      const dmg = Math.max(1, actor.atk - foe.def);
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

function applyStrike(units: Unit[], attackerId: string, defenderId: string): { units: Unit[]; text: string } {
  const attacker = units.find((unit) => unit.id === attackerId);
  const defender = units.find((unit) => unit.id === defenderId);
  if (!attacker || !defender) return { units, text: "" };
  const dmg = Math.max(1, attacker.atk - defender.def);
  const hp = Math.max(0, defender.hp - dmg);
  const next = units.map((unit) => (unit.id === defenderId ? { ...unit, hp } : unit));
  const text =
    hp === 0
      ? `${attacker.name} strikes ${defender.name} for ${dmg}. ${defender.name} falls.`
      : `${attacker.name} strikes ${defender.name} for ${dmg}.`;
  return { units: next, text };
}

export function counterattack(col: number, row: number, mover: Unit, units: Unit[]): { name: string; dmg: number } | null {
  const shifted = units.map((unit) => (unit.id === mover.id ? { ...unit, col, row } : unit));
  const standing = shifted.find((unit) => unit.id === mover.id);
  if (!standing) return null;
  let worst: { name: string; dmg: number } | null = null;
  for (const enemy of living(shifted)) {
    if (enemy.side !== "enemy") continue;
    const reach = dijkstra(enemy, shifted);
    if (strikeTiles(enemy, standing, shifted, reach).length === 0) continue;
    const dmg = Math.max(1, enemy.atk - standing.def);
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

function settle(g: GameState): GameState {
  const winner = winnerOf(g.units);
  if (winner) return { ...g, phase: "victory", winner, selectedId: null, intent: "move" };
  const ready = g.units.some((unit) => unit.side === "player" && unit.hp > 0 && !unit.acted);
  if (!ready) return beginEnemy(g);
  return g;
}

function finishEnemy(g: GameState): GameState {
  const units = g.units.map((unit) => (unit.side === "player" ? { ...unit, acted: false } : unit));
  const winner = winnerOf(units);
  if (winner) {
    return { ...g, units, phase: "victory", winner, selectedId: null, intent: "move", enemyStep: g.enemyStep + 1 };
  }
  return {
    ...g,
    units,
    phase: "player",
    winner: null,
    selectedId: null,
    intent: "move",
    round: g.round + 1,
    enemyStep: g.enemyStep + 1,
  };
}

export function stepEnemy(g: GameState): GameState {
  if (g.phase !== "enemy") return g;
  const already = winnerOf(g.units);
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
  const plan = planMove(actor, g.units);
  let units = withPos(g.units, actor.id, plan.col, plan.row);
  let lastEvent = plan.col !== actor.col || plan.row !== actor.row ? `${actor.name} advances.` : `${actor.name} holds.`;
  if (plan.targetId) {
    const hit = applyStrike(units, actor.id, plan.targetId);
    units = hit.units;
    lastEvent = hit.text;
  }
  units = withActed(units, actor.id);
  const winner = winnerOf(units);
  if (winner) {
    return { ...g, units, phase: "victory", winner, selectedId: null, intent: "move", lastEvent, enemyStep: g.enemyStep + 1 };
  }
  return { ...g, units, lastEvent, enemyStep: g.enemyStep + 1 };
}

export function clickTile(g: GameState, col: number, row: number): GameState {
  if (g.phase === "victory") return g;
  const occupant = at(g.units, col, row);
  if (g.phase === "enemy") return occupant ? { ...g, selectedId: occupant.id } : g;
  const actor = commandingUnit(g);
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
      const hit = applyStrike(g.units, actor.id, occupant.id);
      return settle({
        ...g,
        units: withActed(hit.units, actor.id),
        selectedId: null,
        intent: "move",
        lastEvent: hit.text,
      });
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
        const hit = applyStrike(units, actor.id, occupant.id);
        return settle({
          ...g,
          units: withActed(hit.units, actor.id),
          selectedId: null,
          intent: "move",
          lastEvent: hit.text,
        });
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
  if (g.phase === "enemy") return "Ash host is moving.";
  const actor = commandingUnit(g);
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
}): string | null {
  const { hover, units, commanding, intent, reach, attackIds } = args;
  const unit = at(units, hover.col, hover.row);
  const terrain = TERRAIN[hover.row][hover.col];
  const code = tileKey(hover.col, hover.row);
  const bits: string[] = [];
  if (unit) bits.push(`${unit.name}, ${unit.role}, ${unit.hp}/${unit.maxHp}`);
  if (commanding && unit && attackIds.has(unit.id)) {
    const dmg = Math.max(1, commanding.atk - unit.def);
    bits.push(unit.hp <= dmg ? `Strike deals ${dmg}, a killing blow` : `Strike deals ${dmg}`);
  }
  const inRange =
    commanding !== null && intent === "move" && !unit && reach.cost.has(code) && code !== tileKey(commanding.col, commanding.row);
  if (terrain === "stone") bits.push("Blocks movement");
  else if (inRange) bits.push(`Costs ${reach.cost.get(code)} movement`);
  else if (terrain === "brush") bits.push("Brush costs 2 movement");
  if (commanding && (!unit || unit.id === commanding.id)) {
    const here = commanding.col === hover.col && commanding.row === hover.row;
    if (here || inRange) {
      const threat = counterattack(hover.col, hover.row, commanding, units);
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
