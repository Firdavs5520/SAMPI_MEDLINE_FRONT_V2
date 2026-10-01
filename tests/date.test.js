import { test } from "node:test";
import assert from "node:assert/strict";
import { getCurrentShiftYmd, toTashkentYmd } from "../src/utils/date.js";

// Toshkent = UTC+5. Standart smena 08:00 - 02:00 (yarim tundan o'tadi).
test("01:30 da smena sanasi hali kechagi kun", () => {
  assert.equal(getCurrentShiftYmd({}, new Date("2026-10-01T20:30:00Z")), "2026-10-01");
});

test("02:00 dan keyin yangi smena sanasi", () => {
  assert.equal(getCurrentShiftYmd({}, new Date("2026-10-01T20:59:59Z")), "2026-10-01");
  assert.equal(getCurrentShiftYmd({}, new Date("2026-10-01T21:00:00Z")), "2026-10-02");
});

test("kunduzi kalendar sanasi bilan bir xil", () => {
  assert.equal(getCurrentShiftYmd({}, new Date("2026-10-02T09:00:00Z")), "2026-10-02");
});

test("yil oxirida to'g'ri o'tadi", () => {
  // 2027-01-01 01:00 Toshkent -> smena hali 2026-12-31
  assert.equal(getCurrentShiftYmd({}, new Date("2026-12-31T20:00:00Z")), "2026-12-31");
});

test("yarim tundan o'tmaydigan smena (08:00 - 20:00)", () => {
  const settings = { shiftStartTime: "08:00", shiftEndTime: "20:00" };
  assert.equal(getCurrentShiftYmd(settings, new Date("2026-10-01T20:30:00Z")), "2026-10-02");
});

test("noto'g'ri vaqt kelsa standart smena ishlatiladi", () => {
  const settings = { shiftStartTime: "xx", shiftEndTime: "" };
  assert.equal(getCurrentShiftYmd(settings, new Date("2026-10-01T20:30:00Z")), "2026-10-01");
});

test("toTashkentYmd UTC+5 bo'yicha", () => {
  assert.equal(toTashkentYmd(new Date("2026-10-01T19:00:00Z")), "2026-10-02");
});
