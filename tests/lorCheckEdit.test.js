import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditLorCheck, getLorCheckEditDeadline } from "../src/utils/lorCheckEdit.js";

const HOUR = 60 * 60 * 1000;

test("LOR chekini 12 soat ichida tahrirlash mumkin", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  assert.equal(canEditLorCheck({ createdAt: new Date(now - 11 * HOUR).toISOString() }, now), true);
  assert.equal(canEditLorCheck({ createdAt: new Date(now - 12 * HOUR).toISOString() }, now), false);
  assert.equal(canEditLorCheck({ createdAt: new Date(now - 13 * HOUR).toISOString() }, now), false);
  assert.equal(canEditLorCheck({}, now), false);
  assert.equal(
    getLorCheckEditDeadline({ createdAt: "2026-10-03T00:00:00Z" }).toISOString(),
    "2026-10-03T12:00:00.000Z"
  );
});
