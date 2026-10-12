import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32, normalGenerator } from "../js/random.js";
import { priceBarrierMC, simulatePaths } from "../js/mc.js";
import { bgkBarrier, uocCall } from "../js/pricing.js";

const base = { S0: 100, K: 100, H: 130, r: 0.05, sigma: 0.2, T: 1 };
const closed = uocCall(100, 100, 130, 0.05, 0.2, 1);
const mc = (o) => priceBarrierMC({ ...base, steps: 252, nPaths: 20000, seed: 1, ...o });

test("generators are seeded and well-behaved", () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  for (let i = 0; i < 100; i++) {
    const u = a();
    assert.equal(u, b());
    assert.ok(u >= 0 && u < 1);
  }
  const z = normalGenerator(9);
  const n = 200000;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const x = z();
    s += x;
    s2 += x * x;
  }
  assert.ok(Math.abs(s / n) < 0.01 && Math.abs(s2 / n - 1) < 0.01);
});

test("bridge matches the closed form at daily and monthly steps", () => {
  for (const [steps, nPaths, seed] of [
    [252, 20000, 1],
    [12, 40000, 2],
  ]) {
    const res = mc({ method: "bridge", steps, nPaths, seed });
    assert.ok(Math.abs(res.price - closed) < 4 * res.stdError, JSON.stringify(res));
  }
});

test("discrete monitoring matches the closed form at the BGK-shifted barrier", () => {
  const res = mc({ seed: 3, nPaths: 60000 });
  const target = uocCall(100, 100, bgkBarrier(130, 0.2, 1 / 252, "discrete"), 0.05, 0.2, 1);
  assert.ok(Math.abs(res.price - target) < 4 * res.stdError);
  assert.ok(res.price > closed + 0.15);
});

test("standard error is calibrated across seeds", () => {
  const prices = [];
  const ses = [];
  for (let seed = 1; seed <= 40; seed++) {
    const res = mc({ steps: 52, nPaths: 2000, seed });
    prices.push(res.price);
    ses.push(res.stdError);
  }
  const mean = prices.reduce((a, b) => a + b) / prices.length;
  const spread = Math.sqrt(prices.reduce((a, p) => a + (p - mean) ** 2, 0) / (prices.length - 1));
  const ratio = spread / (ses.reduce((a, b) => a + b) / ses.length);
  assert.ok(ratio > 0.7 && ratio < 1.4, `spread / mean SE = ${ratio}`);
});

test("same seed reproduces, different seed differs", () => {
  assert.deepEqual(mc({ steps: 12 }), mc({ steps: 12 }));
  assert.notEqual(mc({ steps: 12 }).price, mc({ steps: 12, seed: 2 }).price);
});

test("invalid inputs throw", () => {
  assert.throws(() => mc({ nPaths: 1001 }));
  assert.throws(() => mc({ method: "euler" }));
});

test("starting at or above the barrier is worthless", () => {
  for (const S0 of [130, 135]) {
    for (const method of ["discrete", "bridge"]) {
      const res = mc({ S0, method, steps: 12, nPaths: 1000 });
      assert.equal(res.price, 0);
      assert.equal(res.stdError, 0);
    }
  }
});

test("simulatePaths shape and start", () => {
  const p = simulatePaths({ S0: 100, mu: 0.05, sigma: 0.2, T: 1, steps: 252, nPaths: 10, seed: 4 });
  assert.equal(p.length, 10);
  for (const row of p) {
    assert.equal(row.length, 253);
    assert.equal(row[0], 100);
    assert.ok(row.every((x) => x > 0));
  }
});
