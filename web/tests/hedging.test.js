import { test } from "node:test";
import assert from "node:assert/strict";
import { simulatePaths } from "../js/mc.js";
import { deltaHedgePnl } from "../js/hedging.js";

const paths = simulatePaths({ S0: 100, mu: 0.05, sigma: 0.2, T: 1, steps: 252, nPaths: 2000, seed: 7 });
const run = (option, rebalanceEvery) =>
  deltaHedgePnl(option, paths, { K: 100, H: 130, r: 0.05, sigma: 0.2, T: 1, rebalanceEvery });
const stats = (x) => {
  const m = x.reduce((a, b) => a + b) / x.length;
  const sd = Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1));
  return { m, sd, se: sd / Math.sqrt(x.length) };
};

test("vanilla hedging error shrinks with more frequent rebalancing", () => {
  const [a, b, c] = [21, 5, 1].map((k) => stats(run("vanilla", k)).sd);
  assert.ok(a > b && b > c, `${a} ${b} ${c}`);
});

test("both hedges are unbiased and finite", () => {
  for (const [option, k] of [
    ["vanilla", 1],
    ["uoc", 5],
  ]) {
    const x = run(option, k);
    assert.equal(x.length, 2000);
    assert.ok(x.every(Number.isFinite));
    const { m, se } = stats(x);
    assert.ok(Math.abs(m) < 4 * se, `${option}: mean ${m}, se ${se}`);
  }
});

test("the barrier hedge is much noisier than the vanilla hedge", () => {
  assert.ok(stats(run("uoc", 1)).sd > 2 * stats(run("vanilla", 1)).sd);
});

test("unknown option throws", () => {
  assert.throws(() => run("put", 1));
});
