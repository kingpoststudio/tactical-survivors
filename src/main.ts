import "./style.css";
import { playFight, playIdle, stepBattle } from "./autoplay.ts";
import { loadAssetManifest } from "./assets.ts";
import { createBoard } from "./board.ts";
import {
  BATTLE_GOLD,
  BUN_COST,
  RECRUIT_COST,
  WORLD,
  buyBun,
  createCampaign,
  equip,
  KITS,
  linked,
  offerWager,
  OFFER_COST,
  REROLL_COST,
  settleWager,
  stageMapChoice,
  chooseMapBuild,
  takeOffer,
  rerollShop,
  WAGER_STAKE,
  nodeById,
  recruit,
  returnFromBattle,
  setAnswerMode,
  setDifficulty,
  startBattle,
  travel,
  type Campaign,
} from "./campaign.ts";
import {
  attackIdsFor,
  answerCast,
  beginEnemy,
  bumpTargets,
  chooseAction,
  emberTargets,
  chooseBuild,
  clickTile,
  commandingUnit,
  createBattle,
  describeHover,
  finishCast,
  hoverPath,
  mathReady,
  moveKeysFor,
  pickUnit,
  promptFor,
  ROSTER_ORDER,
  presentationDelay,
  scriptedStep,
  selectionReach,
  setBattleMath,
  sparkTargets,
  statusOf,
  stepEnemy,
  stepWalk,
  withCrowd,
  type GameState,
  type Tile,
  type Unit,
} from "./game.ts";
import { isAnswerMode, isDifficulty } from "./mathcast.ts";
import { waveForRound } from "./pressure.ts";
import { buildNames, offersFor, xpCostForNext, type BuildId } from "./progression.ts";

const KIND_LABEL = { camp: "Start", battle: "Battle", reward: "Reward", town: "Town", setup: "Setup" } as const;

function required<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Ashfield is missing ${name}.`);
  return element;
}

const stage = required(document.querySelector<HTMLElement>("#stage"), "#stage");
const map = required(document.querySelector<HTMLElement>("#map"), "#map");
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
const stylePick = required(document.querySelector<HTMLSelectElement>("#style"), "#style");
const styleNote = required(document.querySelector<HTMLElement>("#style-note"), "#style-note");
const difficultyPick = required(document.querySelector<HTMLSelectElement>("#difficulty"), "#difficulty");
const answerPick = required(document.querySelector<HTMLSelectElement>("#answer-mode"), "#answer-mode");
const castButton = required(document.querySelector<HTMLButtonElement>("#cast"), "#cast");
const bumpButton = required(document.querySelector<HTMLButtonElement>("#bump"), "#bump");
const sparkButton = required(document.querySelector<HTMLButtonElement>("#spark"), "#spark");
const emberButton = required(document.querySelector<HTMLButtonElement>("#ember"), "#ember");
const waitButton = required(document.querySelector<HTMLButtonElement>("#wait"), "#wait");
const fastButton = required(document.querySelector<HTMLButtonElement>("#fast"), "#fast");
const actMenu = required(document.querySelector<HTMLElement>("#act-menu"), "#act-menu");
const endTurn = required(document.querySelector<HTMLButtonElement>("#end"), "#end");
const back = required(document.querySelector<HTMLButtonElement>("#back"), "#back");
const pressureButton = required(document.querySelector<HTMLButtonElement>("#pressure"), "#pressure");
const reset = required(document.querySelector<HTMLButtonElement>("#reset"), "#reset");
const castPanel = required(document.querySelector<HTMLElement>("#cast-panel"), "#cast-panel");
const problem = required(document.querySelector<HTMLElement>("#problem"), "#problem");
const caption = required(document.querySelector<HTMLElement>("#caption"), "#caption");
const castNote = required(document.querySelector<HTMLElement>("#cast-note"), "#cast-note");
const choices = required(document.querySelector<HTMLElement>("#choices"), "#choices");
const typedForm = required(document.querySelector<HTMLFormElement>("#typed-form"), "#typed-form");
const typedAnswer = required(document.querySelector<HTMLInputElement>("#typed-answer"), "#typed-answer");
const castContinue = required(document.querySelector<HTMLButtonElement>("#cast-continue"), "#cast-continue");

const manifest = await loadAssetManifest();
const board = createBoard(view, manifest);
type Mode = "map" | "battle" | "pressure";
let mode: Mode = "map";
let campaign: Campaign = createCampaign();
let state = createBattle({ pressure: { enabled: false, waves: [] }, casters: ["mora"] });
let hover: Tile | null = null;
let enemyTimer = 0;
let rosterState: GameState | null = null;
let shownProblem = "";
let fast = false;

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
      button.setAttribute("aria-pressed", state.selectedId === unit.id || state.focusId === unit.id ? "true" : "false");
      const mark = document.createElement("span");
      mark.className = `mark ${shapeClass(unit.role)} ${spent(unit) || unit.hp <= 0 ? "spent" : side === "player" ? "amber" : "host"}`;
      const who = document.createElement("span");
      who.className = "who";
      const name = document.createElement("strong");
      name.textContent = unit.name;
      const line = document.createElement("small");
      const tier = unit.tier ? ` · tier ${unit.tier}` : "";
      const spark = state.casters.includes(unit.id) ? " · Spark" : "";
      line.textContent = `${unit.role} · ${unit.hp}/${unit.maxHp}${tier}${spark}`;
      who.append(name, line);
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
  hint.textContent = "Step a tile. Then Bump or Spark. The answer is the hit.";
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
    const line = document.createElement("small");
    line.textContent = offer.detail;
    button.append(title, line);
    button.addEventListener("click", () => setState(chooseBuild(state, offer.id as BuildId)));
    offers.append(button);
  }
}

function renderActions() {
  const actor =
    commandingUnit(state) ??
    (state.phase === "cast"
      ? state.units.find((unit) => unit.id === state.spell?.casterId && unit.hp > 0 && unit.side === "player") ?? null
      : null);
  const bumps = actor ? bumpTargets(state, actor) : [];
  const sparks = actor ? sparkTargets(state, actor) : [];
  const embers = actor ? emberTargets(state, actor) : [];
  const show =
    mode !== "map" &&
    actor !== null &&
    state.walk.length === 0 &&
    (state.intent === "act" ||
      state.committed ||
      state.phase === "cast" ||
      bumps.length > 0 ||
      sparks.length > 0 ||
      embers.length > 0);
  actMenu.hidden = !show;
  if (!show || !actor) return;
  const locked = state.spell?.outcome === "hit" || state.spell?.outcome === "fizzle";
  bumpButton.disabled = locked || bumps.length === 0;
  sparkButton.hidden = !state.casters.includes(actor.id);
  sparkButton.disabled = locked || sparks.length === 0;
  emberButton.hidden = actor.ability !== "ember";
  emberButton.disabled = locked || embers.length === 0;
  waitButton.hidden = !state.committed && state.intent !== "act";
  waitButton.disabled = locked;
  bumpButton.setAttribute("aria-pressed", state.spell?.kind === "bump" && state.spell.outcome === "open" ? "true" : "false");
  sparkButton.setAttribute("aria-pressed", state.spell?.kind === "spark" && state.spell.outcome === "open" ? "true" : "false");
  emberButton.setAttribute("aria-pressed", state.spell?.kind === "ember" && state.spell.outcome === "open" ? "true" : "false");
}

function renderCast() {
  const spell = state.spell;
  const open = mode !== "map" && spell !== null;
  castPanel.hidden = !open;
  if (!open || !spell) {
    shownProblem = "";
    return;
  }
  problem.textContent = spell.problem.prompt;
  caption.textContent = spell.problem.caption;
  const resolved = spell.outcome !== "open";
  const live = mathReady(state);
  castNote.textContent = spell.outcome === "hit" ? String(spell.damage) : spell.outcome === "fizzle" ? "Fizzle." : "";
  choices.hidden = state.answerMode !== "choice" || resolved || !live;
  typedForm.hidden = state.answerMode !== "typed" || resolved || !live;
  castContinue.hidden = !resolved;
  if (spell.problem.prompt !== shownProblem) {
    shownProblem = spell.problem.prompt;
    typedAnswer.value = "";
  }
  if (!resolved && state.answerMode === "choice") {
    choices.replaceChildren();
    for (const choice of spell.problem.choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.choice = String(choice);
      button.textContent = String(choice);
      button.addEventListener("click", () => setState(answerCast(state, choice)));
      choices.append(button);
    }
  }
}

function renderMap() {
  map.replaceChildren();
  const nodes = document.createElement("div");
  nodes.className = "map-nodes";
  for (const node of WORLD) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = node.id === campaign.nodeId ? "node here" : "node";
    button.dataset.node = node.id;
    const clear = campaign.cleared.includes(node.id) ? " · clear" : "";
    button.textContent = `${node.name} · ${KIND_LABEL[node.kind]}${clear}`;
    const here = node.id === campaign.nodeId;
    button.disabled = here || !linked(campaign.nodeId, node.id);
    button.addEventListener("click", () => enter(node.id));
    nodes.append(button);
  }
  map.append(nodes);
  if (nodeById(campaign.nodeId).kind === "battle") {
    const fight = document.createElement("button");
    fight.type = "button";
    fight.className = "primary";
    fight.dataset.fight = campaign.nodeId;
    fight.textContent = "Fight";
    fight.addEventListener("click", () => beginMapBattle());
    map.append(fight);
  }
  if (campaign.nodeId === "town") {
    const shop = document.createElement("div");
    shop.id = "shop";
    const bun = document.createElement("button");
    bun.type = "button";
    bun.dataset.buy = "bun";
    bun.textContent = `Sweet bun · ${BUN_COST}`;
    bun.disabled = campaign.bunBought || campaign.gold < BUN_COST;
    bun.addEventListener("click", () => {
      campaign = buyBun(campaign);
      render();
    });
    const ally = document.createElement("button");
    ally.type = "button";
    ally.dataset.buy = "pip";
    ally.textContent = `Recruit Pip · ${RECRUIT_COST}`;
    ally.disabled = campaign.recruited || campaign.gold < RECRUIT_COST;
    ally.addEventListener("click", () => {
      campaign = recruit(campaign);
      render();
    });
    const bet = document.createElement("button");
    bet.type = "button";
    bet.dataset.wager = "gold";
    bet.textContent = `Wager · ${WAGER_STAKE}`;
    bet.disabled = campaign.gold < WAGER_STAKE || campaign.wager?.outcome === "open";
    bet.addEventListener("click", () => {
      campaign = offerWager(campaign);
      render();
    });
    shop.append(bun, ally, bet);
    map.append(shop);
    const wager = campaign.wager;
    if (wager?.outcome === "open") {
      const card = document.createElement("div");
      card.id = "wager";
      const problem = document.createElement("p");
      problem.className = "wager-problem";
      problem.textContent = wager.problem.prompt;
      card.append(problem);
      if (campaign.answerMode === "choice") {
        const choices = document.createElement("div");
        choices.className = "wager-choices";
        for (const choice of wager.problem.choices) {
          const pick = document.createElement("button");
          pick.type = "button";
          pick.className = "choice";
          pick.textContent = String(choice);
          pick.addEventListener("click", () => {
            campaign = settleWager(campaign, choice);
            render();
          });
          choices.append(pick);
        }
        card.append(choices);
      } else {
        const form = document.createElement("form");
        const input = document.createElement("input");
        input.inputMode = "numeric";
        input.autocomplete = "off";
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.textContent = "OK";
        form.append(input, submit);
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const text = input.value.trim();
          if (!/^-?\d+$/.test(text)) return;
          campaign = settleWager(campaign, Number(text));
          render();
        });
        card.append(form);
      }
      map.append(card);
    }
  }
  if (campaign.stash.length > 0) {
    const gear = document.createElement("div");
    gear.id = "gear";
    for (const kit of campaign.stash) {
      for (const ally of campaign.party) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.equip = kit;
        button.dataset.ally = ally.id;
        const favor = campaign.favors[kit];
        button.textContent = favor ? `${KITS[kit].name} · ${favor} · ${ally.name}` : `${KITS[kit].name} · ${ally.name}`;
        button.addEventListener("click", () => {
          campaign = equip(campaign, ally.id, kit);
          render();
        });
        gear.append(button);
      }
    }
    map.append(gear);
  }
  const party = document.createElement("div");
  party.id = "map-party";
  for (const ally of campaign.party) {
    const card = document.createElement("div");
    card.className = "card";
    const name = document.createElement("strong");
    name.textContent = ally.name;
    const line = document.createElement("small");
    const spark = ally.spell ? "Spark" : "—";
    const ability = ally.ability ? KITS[ally.ability].name : "—";
    const gear = ally.equip ? KITS[ally.equip].name : "—";
    line.textContent = `${ally.hp}/${ally.maxHp} · ${spark} · ${ability} · ${gear}`;
    card.append(name, line);
    party.append(card);
  }
  map.append(party);
  const bench = document.createElement("div");
  bench.id = "bench";
  const reroll = document.createElement("button");
  reroll.type = "button";
  reroll.dataset.reroll = "shop";
  reroll.textContent = `Reroll · ${REROLL_COST}`;
  reroll.disabled = campaign.gold < REROLL_COST;
  reroll.addEventListener("click", () => {
    campaign = rerollShop(campaign);
    render();
  });
  bench.append(reroll);
  const level = document.createElement("button");
  level.type = "button";
  level.dataset.level = "map";
  level.textContent = "Level";
  level.addEventListener("click", () => {
    campaign = stageMapChoice(campaign);
    render();
  });
  bench.append(level);
  for (const [index, offer] of campaign.offers.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.offer = String(index);
    const label = offer.kind === "kit" ? KITS[offer.kit].name : offer.build;
    button.textContent = `${label} · ${offer.favor} · ${OFFER_COST}`;
    button.disabled = campaign.gold < OFFER_COST;
    button.addEventListener("click", () => {
      campaign = takeOffer(campaign, index);
      render();
    });
    bench.append(button);
  }
  for (const offer of campaign.progression.pending) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.build = offer.id;
    button.textContent = offer.name;
    button.addEventListener("click", () => {
      campaign = chooseMapBuild(campaign, offer.id);
      render();
    });
    bench.append(button);
  }
  map.append(bench);
}

function syncMathControls() {
  const difficulty = mode === "map" ? campaign.difficulty : state.difficulty;
  const answerMode = mode === "map" ? campaign.answerMode : state.answerMode;
  if (difficultyPick.value !== difficulty) difficultyPick.value = difficulty;
  if (answerPick.value !== answerMode) answerPick.value = answerMode;
}

function renderHud() {
  const wave = waveForRound(state.round, state.pressure);
  const pressure = wave?.crowd ? " · crowd" : wave ? " · pressure" : "";
  round.textContent = `Round ${state.round}${pressure}`;
  const cost = xpCostForNext(state.progression.level);
  const xp = state.progressionRules.enabled ? `XP ${state.progression.xp}/${cost}` : "";
  const builds = buildNames(state.progression.taken);
  const gold = mode === "battle" ? `Gold ${campaign.gold}` : "";
  meta.textContent = [gold, xp, builds].filter(Boolean).join(" · ");
  sides.replaceChildren();
  for (const [label, on] of [
    ["Amber", state.phase === "player" || state.phase === "cast" || state.winner === "player"],
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

  castButton.hidden = true;

  if (state.phase === "victory") {
    prompt.textContent =
      mode === "battle" && state.winner === "player"
        ? `Map. ${campaign.gold} + ${BATTLE_GOLD} gold.`
        : state.winner === "player"
          ? "Amber holds the field."
          : "Amber is eliminated.";
    detail.textContent = state.lastEvent || (state.winner === "player" ? "The field is clear." : "Ash host holds the field.");
    endTurn.hidden = true;
    reset.hidden = mode !== "pressure";
    reset.classList.add("primary");
    back.hidden = false;
    back.classList.add("primary");
  } else {
    prompt.textContent = promptFor(state) ?? "";
    const foe = state.units.find((unit) => unit.id === state.focusId);
    detail.textContent =
      state.spell?.outcome === "open" ? (foe ? String(foe.hp) : "") : hoverText || state.lastEvent || "";
    endTurn.hidden = false;
    endTurn.disabled = state.phase !== "player";
    reset.hidden = mode !== "pressure";
    reset.classList.toggle("primary", false);
    back.hidden = mode !== "pressure";
    back.classList.remove("primary");
  }
  pressureButton.hidden = true;
  renderOffers();
  renderActions();
  renderCast();
  if (rosterState !== state) {
    rosterState = state;
    renderRoster();
  }
  const walking = commandingUnit(state);
  const walkPath = walking && state.walk.length > 0 ? [{ col: walking.col, row: walking.row }, ...state.walk] : [];
  board.sync({
    units: state.units,
    selectedId: state.selectedId,
    phase: state.phase,
    moveKeys: moveKeysFor(state, reach),
    attackIds: attacks,
    path: walkPath.length > 1 ? walkPath : hoverPath(state, hover, reach, attacks),
    hover,
  });
}

function renderMapChrome() {
  const node = nodeById(campaign.nodeId);
  round.textContent = node.name;
  const builds = buildNames(campaign.progression.taken);
  meta.textContent = [`Gold ${campaign.gold}`, builds].filter(Boolean).join(" · ");
  sides.replaceChildren();
  prompt.textContent = node.kind === "town" ? "Spend gold." : node.kind === "battle" ? "Fight, or step on." : "Step to the next place.";
  detail.textContent = campaign.lastEvent;
  level.hidden = true;
  castPanel.hidden = true;
  actMenu.hidden = true;
  castButton.hidden = true;
  endTurn.hidden = true;
  back.hidden = true;
  reset.hidden = true;
  pressureButton.hidden = false;
  map.hidden = false;
  view.hidden = true;
  roster.hidden = true;
  renderMap();
}

function render() {
  syncMathControls();
  if (mode === "map") {
    renderMapChrome();
  } else {
    map.hidden = true;
    view.hidden = false;
    roster.hidden = false;
    renderHud();
  }
  publishProbe();
  stage.dataset.mode = mode;
}

function setState(next: GameState) {
  window.clearTimeout(enemyTimer);
  state = next;
  render();
  if (state.spell?.outcome === "open" || state.phase === "cast") return;
  if (mode !== "map" && state.phase === "player" && state.walk.length > 0) {
    enemyTimer = window.setTimeout(() => setState(stepWalk(state)), presentationDelay("walk", fast));
  } else if (mode !== "map" && state.phase === "enemy") {
    enemyTimer = window.setTimeout(() => setState(stepEnemy(state)), presentationDelay("enemy", fast));
  }
}

function showBattle(next: GameState) {
  hover = null;
  rosterState = null;
  setState(next);
  requestAnimationFrame(() => board.resize());
}

function enter(nodeId: string) {
  const result = travel(campaign, nodeId);
  if (result.kind === "stay") return;
  campaign = result.campaign;
  if (result.kind === "battle") {
    mode = "battle";
    showBattle(result.battle);
    return;
  }
  campaign = stageMapChoice(campaign);
  mode = "map";
  render();
}

function beginMapBattle() {
  mode = "battle";
  showBattle(startBattle(campaign));
}

function backToMap() {
  window.clearTimeout(enemyTimer);
  if (mode === "battle") campaign = returnFromBattle(campaign, state);
  campaign = stageMapChoice(campaign);
  mode = "map";
  hover = null;
  render();
}

function startPressure() {
  mode = "pressure";
  showBattle(createBattle({ casters: ["mora"], difficulty: campaign.difficulty, answerMode: campaign.answerMode }));
}

function publishHover(next: Tile | null) {
  const same = next?.col === hover?.col && next?.row === hover?.row;
  if (same || (!next && !hover)) return;
  hover = next;
  if (mode !== "map") render();
}

function publishProbe() {
  if (!import.meta.env.DEV) return;
  const target = state.spell ? state.units.find((unit) => unit.id === state.spell?.targetId) : undefined;
  const metrics = board.metrics();
  probe.dataset.ready = mode === "map" || metrics.actors > 0 ? "1" : "0";
  probe.textContent = JSON.stringify({
    mode,
    node: campaign.nodeId,
    gold: campaign.gold,
    party: campaign.party.map((ally) => ally.name),
    taken: campaign.progression.taken,
    bun: campaign.bunBought,
    recruited: campaign.recruited,
    phase: mode === "map" ? "map" : state.phase,
    round: state.round,
    intent: state.intent,
    lastEvent: mode === "map" ? campaign.lastEvent : state.lastEvent,
    problem: state.spell?.problem.prompt ?? "",
    kind: state.spell?.kind ?? "",
    focus: state.focusId,
    walk: state.walk.length,
    cast: state.spell?.outcome ?? "",
    damage: state.spell?.damage ?? null,
    targetHp: target?.hp ?? null,
    pressure: state.pressure.enabled,
    enemies: state.units.filter((unit) => unit.side === "enemy" && unit.hp > 0).length,
    actors: metrics.actors,
    drawCalls: metrics.drawCalls,
    triangles: metrics.triangles,
    frameMs: Number(metrics.frameMs.toFixed(2)),
    style: manifest.activeStyle || "current",
    winner: mode === "map" ? null : state.winner,
  });
}

endTurn.addEventListener("click", () => setState(beginEnemy(state)));
castButton.addEventListener("click", () => setState(chooseAction(state, "spark")));
bumpButton.addEventListener("click", () => setState(chooseAction(state, "bump")));
sparkButton.addEventListener("click", () => setState(chooseAction(state, "spark")));
emberButton.addEventListener("click", () => setState(chooseAction(state, "ember")));
waitButton.addEventListener("click", () => setState(chooseAction(state, "wait")));
fastButton.addEventListener("click", () => {
  fast = !fast;
  fastButton.setAttribute("aria-pressed", fast ? "true" : "false");
  if (state.spell?.outcome === "open" || state.phase === "cast") return;
  window.clearTimeout(enemyTimer);
  if (mode !== "map" && state.phase === "player" && state.walk.length > 0) {
    enemyTimer = window.setTimeout(() => setState(stepWalk(state)), presentationDelay("walk", fast));
  } else if (mode !== "map" && state.phase === "enemy") {
    enemyTimer = window.setTimeout(() => setState(stepEnemy(state)), presentationDelay("enemy", fast));
  }
});
castContinue.addEventListener("click", () => setState(finishCast(state)));
typedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = typedAnswer.value.trim();
  if (!/^-?\d+$/.test(text)) {
    castNote.textContent = "Type a number.";
    return;
  }
  setState(answerCast(state, Number(text)));
});
back.addEventListener("click", () => backToMap());
pressureButton.addEventListener("click", () => startPressure());
reset.addEventListener("click", () => {
  if (mode !== "pressure") return;
  hover = null;
  showBattle(createBattle({ casters: ["mora"], difficulty: campaign.difficulty, answerMode: campaign.answerMode }));
});
difficultyPick.addEventListener("change", () => {
  if (!isDifficulty(difficultyPick.value)) return;
  campaign = setDifficulty(campaign, difficultyPick.value);
  if (mode !== "map") setState(setBattleMath(state, campaign.difficulty, campaign.answerMode));
  else render();
});
answerPick.addEventListener("change", () => {
  if (!isAnswerMode(answerPick.value)) return;
  campaign = setAnswerMode(campaign, answerPick.value);
  if (mode !== "map") setState(setBattleMath(state, campaign.difficulty, campaign.answerMode));
  else render();
});

board.element.addEventListener("pointerdown", (event) => {
  if (mode === "map" || state.phase === "cast") return;
  const cell = board.pick(event);
  if (!cell) return;
  setState(clickTile(state, cell.col, cell.row));
});
board.element.addEventListener("pointermove", (event) => {
  if (mode === "map") return;
  publishHover(board.pick(event));
});
board.element.addEventListener("pointerleave", () => publishHover(null));

function showStyleNote() {
  const id = manifest.activeStyle ?? "";
  const style = id ? manifest.styles?.[id] : undefined;
  const count = style ? Object.keys(style.slots).length : 0;
  styleNote.textContent = style
    ? `${style.note} ${count} role mesh${count === 1 ? "" : "es"} in this set.`
    : "Current board meshes. Pick a style to preview it. The board look stays until you do.";
}

const currentOption = document.createElement("option");
currentOption.value = "";
currentOption.textContent = "Current board";
stylePick.append(currentOption);
for (const [id, style] of Object.entries(manifest.styles ?? {})) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = style.label || id;
  stylePick.append(option);
}
stylePick.addEventListener("change", () => {
  manifest.activeStyle = stylePick.value;
  showStyleNote();
  render();
});

const params = new URLSearchParams(location.search);
const requested = params.get("style");
if (requested && manifest.styles?.[requested]) {
  manifest.activeStyle = requested;
  stylePick.value = requested;
}
showStyleNote();

if (import.meta.env.DEV && (params.has("pressure") || params.has("crowd"))) {
  mode = "pressure";
  state = createBattle({ casters: ["mora"], difficulty: campaign.difficulty, answerMode: campaign.answerMode });
  if (params.has("crowd")) state = withCrowd(state);
  if (params.has("play")) state = scriptedStep(state);
}

if (import.meta.env.DEV) {
  board.setProbe(() => publishProbe());
}

render();

declare global {
  interface Window {
    __ashfield?: {
      state: () => GameState;
      campaign: () => Campaign;
      mode: () => Mode;
      click: (col: number, row: number) => void;
      project: (col: number, row: number) => { x: number; y: number };
      crowd: () => void;
      previewChoice: () => void;
      play: (mode: "fight" | "idle") => { winner: GameState["winner"]; round: number; phase: GameState["phase"]; actions: number; events: string[] };
      metrics: () => { actors: number; drawCalls: number; triangles: number; frameMs: number };
      nudge: () => void;
      travel: (id: string) => void;
      answer: (given: number) => void;
      finishCast: () => void;
      back: () => void;
    };
  }
}

if (import.meta.env.DEV) {
  window.__ashfield = {
    state: () => state,
    campaign: () => campaign,
    mode: () => mode,
    click: (col, row) => setState(clickTile(state, col, row)),
    project: (col, row) => board.project(col, row),
    crowd: () => {
      mode = "pressure";
      showBattle(withCrowd(state.pressure.enabled ? state : createBattle()));
    },
    previewChoice: () => {
      const pending = state.progression.pending.length
        ? state.progression.pending
        : offersFor(state.progression.level, state.progression.taken);
      setState({ ...state, phase: "level", selectedId: null, progression: { ...state.progression, pending } });
    },
    play: (playMode) => {
      const result = playMode === "idle" ? playIdle(createBattle()) : playFight(createBattle());
      mode = "pressure";
      setState(result.state);
      return {
        winner: result.state.winner,
        round: result.state.round,
        phase: result.state.phase,
        actions: result.actions,
        events: result.events,
      };
    },
    metrics: () => board.metrics(),
      nudge: () => setState(stepBattle(state)),
      travel: (id) => enter(id),
    answer: (given) => setState(answerCast(state, given)),
    finishCast: () => setState(finishCast(state)),
    back: () => backToMap(),
  };
}
