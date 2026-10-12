// Monte Carlo for the up-and-out call under GBM: a port of src/barrier_pricing/mc.py
// (antithetic variates always on; no control variate or knock-in, which the page doesn't use).

import { normalGenerator } from "./random.js";

// Exact GBM paths with drift mu: nPaths rows of length steps + 1, each starting at S0.
export function simulatePaths({ S0, mu, sigma, T, steps, nPaths, seed }) {
  const z = normalGenerator(seed);
  const dt = T / steps;
  const drift = (mu - 0.5 * sigma ** 2) * dt;
  const vol = sigma * Math.sqrt(dt);
  const paths = [];
  for (let p = 0; p < nPaths; p++) {
    const row = new Float64Array(steps + 1);
    row[0] = S0;
    let x = Math.log(S0);
    for (let i = 1; i <= steps; i++) {
      x += drift + vol * z();
      row[i] = Math.exp(x);
    }
    paths.push(row);
  }
  return paths;
}

// Price an up-and-out call by simulation under the risk-neutral measure.
// method "discrete" checks the barrier only at the `steps` monitoring dates; "bridge" weights
// each path by its Brownian-bridge probability of staying below H between dates, which prices
// the continuously monitored contract without discretisation bias. Each normal draw Z is
// paired with -Z; the estimator and its standard error use the pair averages.
export function priceBarrierMC({ S0, K, H, r, sigma, T, steps, nPaths, method = "discrete", seed = 1 }) {
  if (method !== "discrete" && method !== "bridge") {
    throw new Error(`method must be "discrete" or "bridge", got ${JSON.stringify(method)}`);
  }
  if (nPaths % 2 !== 0) throw new Error(`nPaths must be even, got ${nPaths}`);

  const z = normalGenerator(seed);
  const half = nPaths / 2;
  const dt = T / steps;
  const drift = (r - 0.5 * sigma ** 2) * dt;
  const vol = sigma * Math.sqrt(dt);
  const logH = Math.log(H);

  const x = new Float64Array(nPaths).fill(Math.log(S0));
  const survival = new Float64Array(nPaths).fill(S0 < H ? 1 : 0);
  const draws = new Float64Array(half);

  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < half; i++) draws[i] = z();
    for (let p = 0; p < nPaths; p++) {
      const xNew = x[p] + drift + vol * (p < half ? draws[p] : -draws[p - half]);
      if (method === "discrete") {
        if (xNew >= logH) survival[p] = 0;
      } else {
        const a = logH - x[p];
        const b = logH - xNew;
        // a, b > 0 keeps the exponent negative, so exp() cannot overflow.
        const pCross = a > 0 && b > 0 ? Math.exp((-2 * a * b) / (sigma ** 2 * dt)) : 1;
        survival[p] *= 1 - pCross;
      }
      x[p] = xNew;
    }
  }

  const disc = Math.exp(-r * T);
  const payoff = (p) => disc * Math.max(Math.exp(x[p]) - K, 0) * survival[p];
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < half; i++) {
    const y = 0.5 * (payoff(i) + payoff(i + half));
    sum += y;
    sumSq += y * y;
  }
  const price = sum / half;
  const variance = Math.max((sumSq - half * price * price) / (half - 1), 0);
  const stdError = Math.sqrt(variance / half);
  return { price, stdError, nPaths, ci95: [price - 1.96 * stdError, price + 1.96 * stdError] };
}
