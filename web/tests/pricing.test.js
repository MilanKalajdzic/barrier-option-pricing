import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pricing from "../js/pricing.js";

const { cases } = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url)));
const TOL = { uocGamma: { abs: 1e-7, rel: 1e-8 } };

test("every reference case matches the Python package", () => {
  const failures = [];
  for (const { fn, args, expected } of cases) {
    const { abs, rel } = TOL[fn] ?? { abs: 1e-10, rel: 1e-10 };
    const got = pricing[fn](...args);
    if (!(Math.abs(got - expected) <= abs + rel * Math.abs(expected))) {
      failures.push({ fn, args, got, expected });
    }
  }
  assert.deepEqual(failures.slice(0, 5), []);
});

test("normCdf matches known values", () => {
  assert.ok(Math.abs(pricing.normCdf(0) - 0.5) < 1e-15);
  assert.ok(Math.abs(pricing.normCdf(1.96) - 0.9750021048517795) < 1e-14);
  assert.ok(Math.abs(pricing.normCdf(-1.96) - 0.024997895148220435) < 1e-14);
});

test("bgkBarrier rejects unknown targets", () => {
  assert.throws(() => pricing.bgkBarrier(130, 0.2, 1 / 252, "sideways"));
});

test("closed form is finite and non-negative over slider extremes", () => {
  for (const S of [50, 100, 150])
    for (const K of [50, 150])
      for (const H of [101, 200])
        for (const sigma of [0.05, 0.6])
          for (const T of [0.1, 3])
            for (const r of [0, 0.1]) {
              const v = pricing.uocCall(S, K, H, r, sigma, T);
              const d = pricing.uocDelta(S, K, H, r, sigma, T);
              const label = `${S},${K},${H},${sigma},${T},${r}`;
              assert.ok(Number.isFinite(v) && v >= 0 && Number.isFinite(d), label);
            }
});
