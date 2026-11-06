export type TerrainKind = "plain" | "brush" | "stone";

export interface PressureWave {
  round: number;
  count: number;
  tier: number;
  crowd: boolean;
}

export interface PressureRules {
  enabled: boolean;
  waves: readonly PressureWave[];
}

/** Reversible defaults. Set `enabled` to false for the single opening skirmish. */
export const PRESSURE_DEFAULTS: PressureRules = {
  enabled: true,
  waves: [
    { round: 2, count: 2, tier: 1, crowd: false },
    { round: 3, count: 3, tier: 1, crowd: false },
    { round: 4, count: 4, tier: 2, crowd: false },
    { round: 5, count: 8, tier: 2, crowd: true },
    { round: 6, count: 4, tier: 3, crowd: false },
  ],
};

export function waveForRound(round: number, rules: PressureRules = PRESSURE_DEFAULTS): PressureWave | null {
  if (!rules.enabled) return null;
  return rules.waves.find((wave) => wave.round === round) ?? null;
}

export function lastPressureRound(rules: PressureRules = PRESSURE_DEFAULTS): number {
  if (!rules.enabled || rules.waves.length === 0) return 1;
  return rules.waves.reduce((max, wave) => Math.max(max, wave.round), 1);
}

export type FoeRole = "Brute" | "Raider" | "Skirmisher";

export interface FoeStats {
  role: FoeRole;
  maxHp: number;
  atk: number;
  def: number;
  mov: number;
}

const BASE: Record<FoeRole, FoeStats> = {
  Brute: { role: "Brute", maxHp: 12, atk: 5, def: 2, mov: 3 },
  Raider: { role: "Raider", maxHp: 9, atk: 5, def: 1, mov: 4 },
  Skirmisher: { role: "Skirmisher", maxHp: 7, atk: 4, def: 0, mov: 5 },
};

const CYCLE: readonly FoeRole[] = ["Skirmisher", "Raider", "Brute"];

export function foeStats(index: number, tier: number): FoeStats {
  const role = CYCLE[index % CYCLE.length];
  const base = BASE[role];
  const steps = Math.max(0, Math.floor(tier) - 1);
  return {
    role,
    maxHp: base.maxHp + steps * 2,
    atk: base.atk + (tier >= 2 ? 1 : 0),
    def: base.def + (tier >= 3 ? 1 : 0),
    mov: base.mov,
  };
}

export interface SpawnTile {
  col: number;
  row: number;
}

/**
 * Leave a few open tiles so a crowd cannot seal the board.
 * One open tile is kept when the field is already tight.
 */
export function spawnCount(openTiles: number, requested: number): number {
  if (requested <= 0 || openTiles <= 0) return 0;
  const keep = openTiles > 5 ? 4 : 1;
  return Math.min(requested, Math.max(0, openTiles - keep));
}

export function openSpawnTiles(
  occupied: ReadonlyArray<SpawnTile>,
  terrain: ReadonlyArray<ReadonlyArray<TerrainKind>>,
): SpawnTile[] {
  const taken = new Set(occupied.map((tile) => `${tile.col},${tile.row}`));
  const open: SpawnTile[] = [];
  for (let row = 0; row < terrain.length; row++) {
    const line = terrain[row] ?? [];
    for (let col = 0; col < line.length; col++) {
      if (line[col] === "stone") continue;
      if (taken.has(`${col},${row}`)) continue;
      open.push({ col, row });
    }
  }
  return open;
}

export interface PlannedFoe extends FoeStats {
  id: string;
  name: string;
  col: number;
  row: number;
  hp: number;
  tier: number;
}

export function planReinforcements(args: {
  round: number;
  occupied: ReadonlyArray<SpawnTile>;
  terrain: ReadonlyArray<ReadonlyArray<TerrainKind>>;
  rules?: PressureRules;
  usedIds?: ReadonlySet<string>;
}): PlannedFoe[] {
  const rules = args.rules ?? PRESSURE_DEFAULTS;
  const wave = waveForRound(args.round, rules);
  if (!wave) return [];
  const open = openSpawnTiles(args.occupied, args.terrain);
  const count = spawnCount(open.length, wave.count);
  const used = new Set(args.usedIds ?? []);
  const foes: PlannedFoe[] = [];
  let serial = 1;
  for (let index = 0; index < count; index++) {
    let id = `foe-r${args.round}-${serial}`;
    while (used.has(id)) {
      serial += 1;
      id = `foe-r${args.round}-${serial}`;
    }
    used.add(id);
    serial += 1;
    const stats = foeStats(index, wave.tier);
    const tile = open[index];
    if (!tile) break;
    foes.push({
      ...stats,
      id,
      name: `${stats.role} ${index + 1}`,
      col: tile.col,
      row: tile.row,
      hp: stats.maxHp,
      tier: wave.tier,
    });
  }
  return foes;
}
