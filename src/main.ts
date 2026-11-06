import "./style.css";
import { loadAssetManifest } from "./assets.ts";
import { createBoard } from "./board.ts";
import {
  attackIdsFor,
  beginEnemy,
  blurb,
  chooseBuild,
  clickTile,
  commandingUnit,
  createBattle,
  describeHover,
  hoverPath,
  moveKeysFor,
  pickUnit,
  promptFor,
  ROSTER_ORDER,
  scriptedStep,
  selectionReach,
  statusOf,
  stepEnemy,
  withCrowd,
  type GameState,
  type Tile,
  type Unit,
} from "./game.ts";
import { waveForRound } from "./pressure.ts";
import { buildNames, offersFor, xpCostForNext, type BuildId } from "./progression.ts";

const ENEMY_STEP_MS = 640;

function required<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Ashfield is missing ${name}.`);
  return element;
}

const view = required(document.querySelector<HTMLElement>("#view"), "#view");
const round = required(document.querySelector<HTMLElement>("#round"), "#round");
const sides = required(document.querySelector<HTMLElement>("#sides"), "#sides");
const prompt = required(document.querySelector<HTMLElement>("#prompt"), "#prompt");
const detail = required(document.querySelector<HTMLElement>("#detail"), "#detail");
const roster = required(document.querySelector<HTMLElement>("#roster"), "#roster");
const meta = required(document.querySelector<HTMLElement>("#meta"), "#meta");
const level = required(document.querySelector<HTMLElement>("#level"), "#level");
const offers = required(document.querySelector<HTMLElement>("#offers"), "#offers");
const probe = required(document.querySelector<HTMLElement>("#probe"), "#probe");
const endTurn = required(document.querySelector<HTMLButtonElement>("#end"), "#end");
const reset = required(document.querySelector<HTMLButtonElement>("#reset"), "#reset");

const manifest = await loadAssetManifest();
const board = createBoard(view, manifest);
let state = createBattle();
let hover: Tile | null = null;
let enemyTimer = 0;
let rosterState: GameState | null = null;

function shapeClass(role: string): string {
  if (role === "Warden" || role === "Brute") return "square";
  if (role === "Scout" || role === "Skirmisher") return "round";
  return "diamond";
}

function spent(unit: Unit): boolean {
  return (
    unit.acted &&
    ((state.phase === "player" && unit.side === "player") || (state.phase === "enemy" && unit.side === "enemy"))
  );
}

function renderRoster() {
  roster.replaceChildren();
  for (const [title, side] of [
    ["Amber", "player"],
    ["Ash host", "enemy"],
  ] as const) {
    const units = state.units
      .filter((unit) => unit.side === side)
      .slice()
      .sort((a, b) => (ROSTER_ORDER.get(a.id) ?? 1000) - (ROSTER_ORDER.get(b.id) ?? 1000) || a.name.localeCompare(b.name));
    const section = document.createElement("section");
    section.className = "squad";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const count = document.createElement("span");
    count.textContent = `${units.filter((unit) => unit.hp > 0).length} left`;
    heading.append(count);
    const list = document.createElement("div");
    list.className = "units";
    for (const unit of units) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "unit";
      button.setAttribute("aria-pressed", state.selectedId === unit.id ? "true" : "false");
      const mark = document.createElement("span");
      mark.className = `mark ${shapeClass(unit.role)} ${spent(unit) || unit.hp <= 0 ? "spent" : side === "player" ? "amber" : "host"}`;
      const who = document.createElement("span");
      who.className = "who";
      const name = document.createElement("strong");
      name.textContent = unit.name;
      const meta = document.createElement("small");
      const tier = unit.tier ? ` · tier ${unit.tier}` : "";
      meta.textContent = `${unit.role} · ${unit.hp}/${unit.maxHp}${tier}`;
      who.append(name, meta);
      const status = document.createElement("span");
      status.className = "status";
      status.textContent = statusOf(unit, state);
      button.append(mark, who, status);
      button.addEventListener("click", () => setState(pickUnit(state, unit.id)));
      list.append(button);
    }
    section.append(heading, list);
    roster.append(section);
  }
  const hint = document.createElement("p");
  hint.id = "hint";
  hint.textContent =
    "Select an Amber fighter, then a highlighted tile or a red ring. Brush costs 2 move. Stone blocks. Foes grow as the rounds climb.";
  roster.append(hint);
}

function renderOffers() {
  level.hidden = state.phase !== "level";
  offers.replaceChildren();
  if (state.phase !== "level") return;
  for (const offer of state.progression.pending) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "offer primary";
    const title = document.createElement("strong");
    title.textContent = `${offer.name} · ${offer.kind}`;
    const detail = document.createElement("small");
    detail.textContent = offer.detail;
    button.append(title, detail);
    button.addEventListener("click", () => setState(chooseBuild(state, offer.id as BuildId)));
    offers.append(button);
  }
}

function renderHud() {
  const wave = waveForRound(state.round, state.pressure);
  const pressure = wave?.crowd ? " · crowd" : wave ? " · pressure" : "";
  round.textContent = `Round ${state.round}${pressure}`;
  const cost = xpCostForNext(state.progression.level);
  const xp = state.progressionRules.enabled ? `XP ${state.progression.xp}/${cost}` : "";
  const builds = buildNames(state.progression.taken);
  meta.textContent = [xp, builds].filter(Boolean).join(" · ");
  sides.replaceChildren();
  for (const [label, on] of [
    ["Amber", state.phase === "player" || state.winner === "player"],
    ["Ash host", state.phase === "enemy" || state.winner === "enemy"],
  ] as const) {
    const pill = document.createElement("span");
    pill.className = on ? "pill on" : "pill";
    pill.textContent = label;
    sides.append(pill);
  }

  const reach = selectionReach(state);
  const attacks = attackIdsFor(state, reach);
  const commanding = commandingUnit(state);
  const hoverText = hover
    ? describeHover({
        hover,
        units: state.units,
        commanding,
        intent: state.intent,
        reach,
        attackIds: attacks,
        taken: state.progression.taken,
        coverDefense: state.progressionRules.coverDefense,
      })
    : null;

  if (state.phase === "victory") {
    prompt.textContent = state.winner === "player" ? "Amber holds the field." : "Amber is eliminated.";
    detail.textContent = state.lastEvent || (state.winner === "player" ? "The waves are done." : "Ash host holds the field.");
    endTurn.hidden = true;
    reset.classList.add("primary");
  } else {
    prompt.textContent = promptFor(state) ?? "";
    const selected = state.units.find((unit) => unit.id === state.selectedId);
    const stats = selected ? `${selected.name}: ${blurb(selected.role)} Attack ${selected.atk}, defense ${selected.def}, move ${selected.mov}.` : "";
    detail.textContent = hoverText || state.lastEvent || stats;
    endTurn.hidden = false;
    endTurn.disabled = state.phase !== "player";
    reset.classList.toggle("primary", false);
  }
  renderOffers();
  if (rosterState !== state) {
    rosterState = state;
    renderRoster();
  }
  board.sync({
    units: state.units,
    selectedId: state.selectedId,
    phase: state.phase,
    moveKeys: moveKeysFor(state, reach),
    attackIds: attacks,
    path: hoverPath(state, hover, reach, attacks),
    hover,
  });
}

function setState(next: GameState) {
  window.clearTimeout(enemyTimer);
  state = next;
  renderHud();
  if (state.phase === "enemy") {
    enemyTimer = window.setTimeout(() => setState(stepEnemy(state)), ENEMY_STEP_MS);
  }
}

function publishHover(next: Tile | null) {
  const same = next?.col === hover?.col && next?.row === hover?.row;
  if (same || (!next && !hover)) return;
  hover = next;
  renderHud();
}

endTurn.addEventListener("click", () => setState(beginEnemy(state)));
reset.addEventListener("click", () => {
  hover = null;
  setState(createBattle());
});

board.element.addEventListener("pointerdown", (event) => {
  const cell = board.pick(event);
  if (!cell) return;
  setState(clickTile(state, cell.col, cell.row));
});
board.element.addEventListener("pointermove", (event) => {
  publishHover(board.pick(event));
});
board.element.addEventListener("pointerleave", () => publishHover(null));

const params = new URLSearchParams(location.search);
if (import.meta.env.DEV && params.has("crowd")) {
  state = withCrowd(state);
  if (params.has("play")) state = scriptedStep(state);
}

if (import.meta.env.DEV) {
  board.setProbe((metrics) => {
    const enemies = state.units.filter((unit) => unit.side === "enemy" && unit.hp > 0).length;
    probe.dataset.ready = metrics.actors > 0 ? "1" : "0";
    probe.textContent = JSON.stringify({
      enemies,
      actors: metrics.actors,
      drawCalls: metrics.drawCalls,
      triangles: metrics.triangles,
      frameMs: Number(metrics.frameMs.toFixed(2)),
      phase: state.phase,
      round: state.round,
      lastEvent: state.lastEvent,
    });
  });
}

renderHud();

declare global {
  interface Window {
    __ashfield?: {
      state: () => GameState;
      click: (col: number, row: number) => void;
      project: (col: number, row: number) => { x: number; y: number };
      crowd: () => void;
      previewChoice: () => void;
      metrics: () => { actors: number; drawCalls: number; triangles: number; frameMs: number };
    };
  }
}

if (import.meta.env.DEV) {
  window.__ashfield = {
    state: () => state,
    click: (col, row) => setState(clickTile(state, col, row)),
    project: (col, row) => board.project(col, row),
      crowd: () => setState(withCrowd(state)),
      previewChoice: () => {
        const pending = state.progression.pending.length
          ? state.progression.pending
          : offersFor(state.progression.level, state.progression.taken);
        setState({ ...state, phase: "level", selectedId: null, progression: { ...state.progression, pending } });
      },
      metrics: () => board.metrics(),
  };
}
