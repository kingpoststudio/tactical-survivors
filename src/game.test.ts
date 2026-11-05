import assert from "node:assert/strict";
import { at, clickTile, createBattle, dijkstra, TERRAIN, tileKey } from "./game.ts";

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
const penn = game.units.find((unit) => unit.id === "penn");
assert.equal(penn?.col, 7);
assert.equal(penn?.row, 4);
assert.equal(penn?.acted, true);

game = createBattle();
game.units = game.units.map((unit) => (unit.id === "vetch" ? { ...unit, col: 6, row: 5 } : unit));
game = clickTile(game, 6, 6);
game = clickTile(game, 6, 5);
const vetch = game.units.find((unit) => unit.id === "vetch");
assert.equal(vetch?.hp, 3);
assert.equal(game.units.find((unit) => unit.id === "penn")?.acted, true);

console.log("ashfield rules ok");
