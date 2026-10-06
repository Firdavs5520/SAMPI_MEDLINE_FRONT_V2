import { test } from "node:test";
import assert from "node:assert/strict";
import { toUzbekCardinal, toUzbekOrdinal } from "../src/utils/uzbekNumbers.js";

test("o'zbekcha sanoq sonlar", () => {
  assert.equal(toUzbekCardinal(1), "bir");
  assert.equal(toUzbekCardinal(15), "o'n besh");
  assert.equal(toUzbekCardinal(40), "qirq");
  assert.equal(toUzbekCardinal(99), "to'qson to'qqiz");
  assert.equal(toUzbekCardinal(100), "yuz");
  assert.equal(toUzbekCardinal(125), "yuz yigirma besh");
});

test("o'zbekcha tartib sonlar", () => {
  const cases = {
    1: "birinchi",
    2: "ikkinchi",
    3: "uchinchi",
    4: "to'rtinchi",
    6: "oltinchi",
    7: "yettinchi",
    9: "to'qqizinchi",
    10: "o'ninchi",
    15: "o'n beshinchi",
    20: "yigirmanchi",
    22: "yigirma ikkinchi",
    30: "o'ttizinchi",
    40: "qirqinchi",
    50: "elliginchi",
    60: "oltmishinchi",
    80: "saksoninchi",
    90: "to'qsoninchi",
    100: "yuzinchi",
    101: "yuz birinchi"
  };
  for (const [number, expected] of Object.entries(cases)) {
    assert.equal(toUzbekOrdinal(Number(number)), expected, number);
  }
});
