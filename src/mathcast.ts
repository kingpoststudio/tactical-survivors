export type Difficulty = "within-5" | "within-10" | "within-20" | "harder";
export type ProblemKind = "count" | "sum" | "difference";
export type AnswerMode = "choice" | "typed";

export const DIFFICULTIES: readonly Difficulty[] = ["within-5", "within-10", "within-20", "harder"];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  "within-5": "Counting",
  "within-10": "Sums to 10",
  "within-20": "Sums to 20",
  harder: "Harder",
};

export interface MathProblem {
  prompt: string;
  caption: string;
  answer: number;
  choices: readonly number[];
  kind: ProblemKind;
}

export interface Grade {
  correct: boolean;
  damage: number;
}

/** A miss. Never the number that was typed or tapped. */
export const FIZZLE_DAMAGE = 0;

export const SPELL_RANGE = 5;

function int(rng: () => number, span: number): number {
  return Math.floor(rng() * span);
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = int(rng, index + 1);
    const hold = next[index];
    next[index] = next[swap];
    next[swap] = hold;
  }
  return next;
}

function dots(count: number): string {
  return Array.from({ length: count }, () => "●").join(" ");
}

function choices(answer: number, cap: number, rng: () => number): number[] {
  const picked = [answer];
  for (let offset = 1; picked.length < 4 && offset <= cap + 1; offset++) {
    for (const value of [answer - offset, answer + offset]) {
      if (picked.length >= 4) break;
      if (value >= 0 && value <= cap && !picked.includes(value)) picked.push(value);
    }
  }
  let extra = 0;
  while (picked.length < 4) {
    if (!picked.includes(extra)) picked.push(extra);
    extra += 1;
  }
  return shuffle(picked, rng);
}

function sumPair(max: number, rng: () => number): { a: number; b: number } {
  const a = 1 + int(rng, max - 1);
  const b = 1 + int(rng, max - a);
  return { a, b };
}

function diffPair(max: number, rng: () => number): { a: number; b: number } {
  const a = 2 + int(rng, max - 1);
  const b = 1 + int(rng, a - 1);
  return { a, b };
}

function problem(kind: ProblemKind, prompt: string, answer: number, cap: number, rng: () => number): MathProblem {
  return { kind, prompt, caption: "How many?", answer, choices: choices(answer, cap, rng) };
}

/** A regular hit. The answer is the hit, so a correct tap deals that many. */
export function makeStrikeProblem(damage: number, rng: () => number = Math.random): MathProblem {
  const answer = Math.max(1, Math.floor(damage));
  if (answer <= 5) return problem("count", dots(answer), answer, 5, rng);
  const left = 1 + int(rng, answer - 1);
  return problem("sum", `${left} + ${answer - left}`, answer, answer, rng);
}

export function makeProblem(difficulty: Difficulty, rng: () => number = Math.random): MathProblem {
  if (difficulty === "within-5") {
    if (rng() < 0.5) {
      const answer = 1 + int(rng, 5);
      return problem("count", dots(answer), answer, 5, rng);
    }
    const { a, b } = sumPair(5, rng);
    return problem("sum", `${a} + ${b}`, a + b, 5, rng);
  }
  const max = difficulty === "within-10" ? 10 : difficulty === "within-20" ? 20 : 50;
  if (rng() < 0.5) {
    const { a, b } = sumPair(max, rng);
    return problem("sum", `${a} + ${b}`, a + b, max, rng);
  }
  const { a, b } = diffPair(max, rng);
  return problem("difference", `${a} − ${b}`, a - b, max, rng);
}

export function gradeAnswer(problem: MathProblem, given: number): Grade | null {
  if (!Number.isInteger(given)) return null;
  if (given === problem.answer) return { correct: true, damage: problem.answer };
  return { correct: false, damage: FIZZLE_DAMAGE };
}

export function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

export function isAnswerMode(value: string): value is AnswerMode {
  return value === "choice" || value === "typed";
}
