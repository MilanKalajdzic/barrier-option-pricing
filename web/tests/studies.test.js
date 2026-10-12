import { test } from "node:test";
import assert from "node:assert/strict";
import { hedgingStudy, pricerSimulations } from "../js/studies.js";
import { uocCall } from "../js/pricing.js";

const contract = { S0: 100, K: 100, H: 130, r: 0.05, sigma: 0.2, T: 1 };
const rebalanceDays = [21, 10, 5, 2, 1];
const sd = (x) => {
  const m = x.reduce((a, b) => a + b) / x.length;
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1));
};

test("hedgingStudy returns P&L / premium for every option and frequency", () => {
  const study = hedgingStudy({ contract, rebalanceDays, nPaths: 500, seed: 3 });
  assert.equal(study.dead, false);
  for (const option of ["vanilla", "uoc"]) {
    assert.equal(study.relPnl[option].length, rebalanceDays.length);
    for (const x of study.relPnl[option]) {
      assert.equal(x.length, 500);
      assert.ok(x.every(Number.isFinite));
    }
  }
  assert.ok(sd(study.relPnl.vanilla[4]) < sd(study.relPnl.vanilla[0]));
});

test("hedgingStudy reports a dead contract instead of dividing by a zero premium", () => {
  for (const dead of [{ S0: 135 }, { K: 140 }]) {
    const study = hedgingStudy({ contract: { ...contract, ...dead }, rebalanceDays, nPaths: 100, seed: 1 });
    assert.equal(study.dead, true);
    assert.equal(study.relPnl, null);
  }
});

test("pricerSimulations skips the discrete run for a continuous barrier", () => {
  const sims = pricerSimulations({ contract, steps: 12, nPaths: 20000, seed: 1, discrete: false });
  assert.equal(sims.discrete, null);
  const closed = uocCall(100, 100, 130, 0.05, 0.2, 1);
  assert.ok(Math.abs(sims.bridge.price - closed) < 4 * sims.bridge.stdError);
  const both = pricerSimulations({ contract, steps: 12, nPaths: 2000, seed: 1, discrete: true });
  assert.ok(both.discrete.price > both.bridge.price);
});
