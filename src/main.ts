import "./style.css";
import { createBoard } from "./board.ts";
import {
  attackIdsFor,
  beginEnemy,
  blurb,
  clickTile,
  commandingUnit,
  createBattle,
  describeHover,
  hoverPath,
  moveKeysFor,
  pickUnit,
  promptFor,
  ROSTER_ORDER,
  selectionReach,
  statusOf,
  stepEnemy,
  type GameState,
  type Tile,
  type Unit,
} from "./game.ts";

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
const endTurn = required(document.querySelector<HTMLButtonElement>("#end"), "#end");
const reset = required(document.querySelector<HTMLButtonElement>("#reset"), "#reset");

const board = createBoard(view);
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
      .sort((a, b) => (ROSTER_ORDER.get(a.id) ?? 0) - (ROSTER_ORDER.get(b.id) ?? 0));
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
      meta.textContent = `${unit.role} · ${unit.hp}/${unit.maxHp}`;
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
  hint.textContent = "Oak, Lumen, and the cute host stand on the field. The rest of the set is around the board.";
  roster.append(hint);
}

function renderHud() {
  round.textContent = `Round ${state.round}`;
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
    ? describeHover({ hover, units: state.units, commanding, intent: state.intent, reach, attackIds: attacks })
    : null;

  if (state.phase === "victory") {
    prompt.textContent = state.winner === "player" ? "Ash host is eliminated." : "Amber is eliminated.";
    detail.textContent = state.lastEvent || (state.winner === "player" ? "Amber holds the field." : "Ash host holds the field.");
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

renderHud();

declare global {
  interface Window {
    __ashfield?: {
      state: () => GameState;
      click: (col: number, row: number) => void;
      project: (col: number, row: number) => { x: number; y: number };
    };
  }
}

if (import.meta.env.DEV) {
  window.__ashfield = {
    state: () => state,
    click: (col, row) => setState(clickTile(state, col, row)),
    project: (col, row) => board.project(col, row),
  };
}
