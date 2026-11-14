import assert from "node:assert/strict";
import test from "node:test";
import { entranceWorld, exitWorld, generateWarehouse, overlaps } from "../src/play/generate";

const entry = ["saluting-device", "plow-gun", "storm-mask"];
const items = [...entry, "plasma-globe", "quantum-lighter"];

test("rooms connect, do not overlap, and keep a stable entry", () => {
  const first = generateWarehouse({ seed: 7, count: 40, entryItemIds: entry, itemIds: items });
  const second = generateWarehouse({ seed: 99, count: 40, entryItemIds: entry, itemIds: items });
  assert.ok(first.length >= 24, `only ${first.length} rooms`);
  assert.equal(first[0]?.id, "entry");
  assert.equal(first[0]?.piece, "entry");
  assert.deepEqual(first[0]?.itemIds, entry);
  assert.deepEqual(second[0]?.itemIds, entry);
  assert.equal(first[0]?.position.x, 0);
  assert.notDeepEqual(
    first.slice(1).map((room) => room.piece),
    second.slice(1).map((room) => room.piece),
  );

  const landmarks = new Set(first.map((room) => room.landmark));
  assert.equal(landmarks.has("rube"), true);
  assert.equal(landmarks.has("doc"), true);
  assert.equal(landmarks.has("ooger"), true);

  for (let i = 1; i < first.length; i += 1) {
    const prev = first[i - 1];
    const room = first[i];
    assert.ok(prev && room);
    const door = exitWorld(prev);
    const entrance = entranceWorld(room);
    assert.ok(Math.hypot(door.x - entrance.x, door.z - entrance.z) < 0.02);
    for (let j = 0; j < i; j += 1) {
      const other = first[j];
      assert.ok(other);
      assert.equal(overlaps(other, room), false);
    }
  }
});
