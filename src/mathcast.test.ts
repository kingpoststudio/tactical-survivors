import assert from "node:assert/strict";
import { answerCast, clickTile, createBattle, finishCast, finishWalk } from "./game.ts";
import { FIZZLE_DAMAGE, gradeAnswer, makeProblem, makeStrikeProblem, type Difficulty, type MathProblem } from "./mathcast.ts";

function scripted(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function capFor(difficulty: Difficulty): number {
  if (difficulty === "within-5") return 5;
  if (difficulty === "within-10") return 10;
  if (difficulty === "within-20") return 20;
  return 50;
}

function assertShape(problem: MathProblem, difficulty: Difficulty) {
  const cap = capFor(difficulty);
  assert.ok(problem.answer >= 1 && problem.answer <= cap, `${difficulty} answer ${problem.answer}`);
  assert.equal(problem.caption, "How many?");
  assert.equal(problem.choices.length, 4);
  assert.equal(new Set(problem.choices).size, 4);
  assert.ok(problem.choices.includes(problem.answer));
  assert.ok(problem.choices.every((choice) => choice >= 0 && choice <= cap));
  if (problem.kind === "count") {
    assert.equal(difficulty, "within-5");
    assert.equal(problem.prompt.split(" ").length, problem.answer);
    assert.ok(problem.prompt.split(" ").every((mark) => mark === "●"));
  } else if (problem.kind === "sum") {
    const [left, right] = problem.prompt.split(" + ").map(Number);
    assert.ok(left >= 1 && right >= 1);
    assert.equal(left + right, problem.answer);
    assert.ok(left + right <= cap);
  } else {
    const [left, right] = problem.prompt.split(" − ").map(Number);
    assert.ok(left >= 2 && right >= 1 && right < left);
    assert.equal(left - right, problem.answer);
    assert.ok(left <= cap);
  }
}

const count = makeProblem("within-5", scripted([0, 0]));
assert.equal(count.kind, "count");
assert.equal(count.answer, 1);
assert.equal(count.prompt, "●");

const sum = makeProblem("within-5", scripted([0.5, 0, 0]));
assert.equal(sum.kind, "sum");
assert.equal(sum.prompt, "1 + 1");
assert.equal(sum.answer, 2);

const difference = makeProblem("within-10", scripted([0.5, 0, 0]));
assert.equal(difference.kind, "difference");
assert.equal(difference.prompt, "2 − 1");
assert.equal(difference.answer, 1);

const harder = makeProblem("harder", scripted([0, 0, 0]));
assert.equal(harder.kind, "sum");
assert.equal(harder.answer, 2);
assert.ok(harder.answer <= 50);

const seen = new Set<string>();
for (const difficulty of ["within-5", "within-10", "within-20", "harder"] as const) {
  for (let seed = 1; seed <= 40; seed++) {
    const problem = makeProblem(difficulty, mulberry32(seed + difficulty.length * 100));
    assertShape(problem, difficulty);
    seen.add(problem.kind);
    const right = gradeAnswer(problem, problem.answer);
    const wrong = gradeAnswer(problem, 99);
    assert.deepEqual(right, { correct: true, damage: problem.answer });
    assert.ok(wrong);
    assert.equal(wrong.correct, false);
    assert.equal(wrong.damage, FIZZLE_DAMAGE);
    assert.notEqual(wrong.damage, 99);
    assert.equal(gradeAnswer(problem, 1.5), null);
  }
}
assert.ok(seen.has("count"));
assert.ok(seen.has("sum"));
assert.ok(seen.has("difference"));

const strike = makeStrikeProblem(4, scripted([0]));
assert.equal(strike.kind, "count");
assert.equal(strike.prompt, "● ● ● ●");
assert.equal(strike.answer, 4);
const bigStrike = makeStrikeProblem(6, scripted([0]));
assert.equal(bigStrike.kind, "sum");
assert.equal(bigStrike.prompt, "1 + 5");
assert.equal(bigStrike.answer, 6);

const typed = gradeAnswer(sum, 99);
assert.deepEqual(typed, { correct: false, damage: 0 });
assert.notEqual(typed?.damage, 99);

let game = createBattle({
  pressure: { enabled: false, waves: [] },
  casters: ["mora"],
  difficulty: "within-5",
  random: scripted([0, 0]),
});
game = clickTile(game, 3, 6);
game = finishWalk(clickTile(game, 3, 3));
assert.equal(game.units.find((unit) => unit.id === "mora")?.col, 3);
assert.equal(game.units.find((unit) => unit.id === "mora")?.row, 3);
assert.equal(game.intent, "act");
assert.equal(game.spell?.kind, "spark");
assert.equal(game.phase, "player");

const cast = clickTile(game, 4, 0);
assert.equal(cast.phase, "player");
assert.equal(cast.spell?.targetId, "ruck");
assert.equal(cast.spell?.problem.prompt, "●");
assert.equal(cast.spell?.problem.answer, 1);
const before = cast.units.find((unit) => unit.id === "ruck")?.hp;
assert.equal(before, 9);

const wrongCast = answerCast(cast, 99);
assert.equal(wrongCast.spell?.outcome, "fizzle");
assert.equal(wrongCast.spell?.given, 99);
assert.equal(wrongCast.spell?.damage, 0);
assert.notEqual(wrongCast.spell?.damage, 99);
assert.equal(wrongCast.spell?.problem.prompt, cast.spell?.problem.prompt);
assert.equal(wrongCast.units.find((unit) => unit.id === "ruck")?.hp, before);
assert.equal(wrongCast.phase, "cast");

const afterFizzle = finishCast(wrongCast);
assert.equal(afterFizzle.phase, "player");
assert.equal(afterFizzle.spell, null);
assert.equal(afterFizzle.units.find((unit) => unit.id === "mora")?.acted, true);
assert.equal(afterFizzle.units.find((unit) => unit.id === "ruck")?.hp, before);
assert.match(afterFizzle.lastEvent, /Fizzle/);
assert.match(afterFizzle.lastEvent, /●/);

let hit = createBattle({
  pressure: { enabled: false, waves: [] },
  casters: ["mora"],
  difficulty: "within-5",
  random: () => 0,
});
hit = clickTile(hit, 3, 6);
hit = finishWalk(clickTile(hit, 3, 3));
hit = beginFrom(hit);
const boulder = hit.units.find((unit) => unit.id === "ash");
assert.ok(boulder);
const struck = answerCast({ ...hit, spell: hit.spell && { ...hit.spell, targetId: "ash" } }, 1);
assert.equal(struck.spell?.damage, 1);
assert.equal(struck.units.find((unit) => unit.id === "ash")?.hp, 11);
assert.notEqual(struck.spell?.damage, 6);

function beginFrom(state: typeof hit) {
  return clickTile(state, 4, 0);
}

const missed = answerCast(hit, 4);
assert.equal(missed.units.find((unit) => unit.id === "ruck")?.hp, 9);
assert.equal(missed.spell?.damage, 0);
assert.notEqual(missed.spell?.damage, 4);

console.log("math cast ok");
