import assert from "node:assert/strict";
import { answerCast, at, clickTile, createBattle, dijkstra, finishCast, stepWalk, TERRAIN, tileKey } from "./game.ts";

const brush = dijkstra({ id: "t", name: "T", role: "Scout", side: "player", col: 0, row: 3, hp: 1, maxHp: 1, atk: 1, def: 0, mov: 1, acted: false }, [
  { id: "t", name: "T", role: "Scout", side: "player", col: 0, row: 3, hp: 1, maxHp: 1, atk: 1, def: 0, mov: 1, acted: false },
]);
assert.equal(brush.cost.has(tileKey(1, 3)), false);

const brushWalker = { id: "t", name: "T", role: "Scout", side: "player" as const, col: 0, row: 3, hp: 1, maxHp: 1, atk: 1, def: 0, mov: 2, acted: false };
assert.equal(dijkstra(brushWalker, [brushWalker]).cost.get(tileKey(1, 3)), 2);

const nearStone = { id: "s", name: "S", role: "Warden", side: "player" as const, col: 4, row: 3, hp: 1, maxHp: 1, atk: 1, def: 0, mov: 5, acted: false };
assert.equal(dijkstra(nearStone, [nearStone]).cost.has(tileKey(4, 4)), false);
assert.equal(TERRAIN[4][4], "stone");

let game = createBattle();
game = clickTile(game, 6, 6);
assert.equal(game.selectedId, "penn");
game = clickTile(game, 6, 2);
assert.equal(at(game.units, 6, 6)?.id, "penn");
game = clickTile(game, 7, 4);
assert.ok(game.walk.length > 1);
assert.equal(game.units.find((unit) => unit.id === "penn")?.row, 6);
while (game.walk.length > 0) {
  const before = game.units.find((unit) => unit.id === "penn");
  game = stepWalk(game);
  const after = game.units.find((unit) => unit.id === "penn");
  assert.equal(Math.abs((after?.col ?? 0) - (before?.col ?? 0)) + Math.abs((after?.row ?? 0) - (before?.row ?? 0)), 1);
}
const penn = game.units.find((unit) => unit.id === "penn");
assert.equal(penn?.col, 7);
assert.equal(penn?.row, 4);
assert.equal(penn?.acted, true);

game = createBattle();
game.units = game.units.map((unit) => (unit.id === "vetch" ? { ...unit, col: 6, row: 5 } : unit));
game = clickTile(game, 6, 6);
assert.equal(game.focusId, "vetch");
assert.equal(game.spell?.kind, "bump");
assert.equal(game.spell?.problem.answer, 4);
assert.equal(game.units.find((unit) => unit.id === "vetch")?.hp, 7);
const wrong = answerCast(game, 99);
assert.equal(wrong.spell?.damage, 0);
assert.notEqual(wrong.spell?.damage, 99);
assert.equal(wrong.units.find((unit) => unit.id === "vetch")?.hp, 7);
game = finishCast(answerCast(game, 4));
const vetch = game.units.find((unit) => unit.id === "vetch");
assert.equal(vetch?.hp, 3);
assert.equal(game.units.find((unit) => unit.id === "penn")?.acted, true);

const looked = clickTile(createBattle(), 1, 0);
assert.equal(looked.focusId, "ash");
assert.equal(looked.spell?.kind, "bump");
assert.equal(looked.phase, "player");
const untouched = answerCast(looked, looked.spell?.problem.answer ?? 0);
assert.equal(untouched.phase, "player");
assert.equal(untouched.units.find((unit) => unit.id === "ash")?.hp, 12);

console.log("ashfield rules ok");
