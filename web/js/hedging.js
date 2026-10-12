// Discrete delta hedging of a short call along simulated paths: a port of
// src/barrier_pricing/hedging.py with the same conventions.

import { bgkBarrier, bsCall, bsCallDelta, uocDeltaFn, uocPricer } from "./pricing.js";

// Terminal P&L per path of selling one option at model price and delta hedging it.
// `paths` are rows from simulatePaths; each column is one monitoring date. The up-and-out
// contract is knocked out at the first date with S >= H (checked every step, whatever the
// rebalancing frequency); the stock position is then sold and the path is no longer hedged.
// Its price and delta come from the closed form at the BGK-shifted barrier, so the model
// matches the discretely monitored contract. Cash earns r. H is ignored for the vanilla call.
export function deltaHedgePnl(option, paths, { K, H, r, sigma, T, rebalanceEvery }) {
  const nPaths = paths.length;
  const steps = paths[0].length - 1;
  const dt = T / steps;
  const S0 = paths[0][0];

  // deltaAt(tau) returns the hedge ratio as a function of spot for time to expiry tau.
  let premium;
  let deltaAt;
  if (option === "uoc") {
    const Hmodel = bgkBarrier(H, sigma, dt, "discrete");
    premium = uocPricer(K, Hmodel, r, sigma, T)(S0);
    deltaAt = (tau) => uocDeltaFn(K, Hmodel, r, sigma, tau);
  } else if (option === "vanilla") {
    premium = bsCall(S0, K, r, sigma, T);
    deltaAt = (tau) => (S) => bsCallDelta(S, K, r, sigma, tau);
  } else {
    throw new Error(`option must be "uoc" or "vanilla", got ${JSON.stringify(option)}`);
  }

  const growth = Math.exp(r * dt);
  const shares = new Float64Array(nPaths).fill(deltaAt(T)(S0));
  const cash = new Float64Array(nPaths).fill(premium - shares[0] * S0);
  const alive = new Uint8Array(nPaths).fill(option === "uoc" ? Number(S0 < H) : 1);

  // Date by date, so each date's delta function is built once and shared by every path.
  for (let i = 1; i <= steps; i++) {
    const rebalance = i < steps && i % rebalanceEvery === 0;
    const delta = rebalance ? deltaAt(T - i * dt) : null;
    for (let p = 0; p < nPaths; p++) {
      const S = paths[p][i];
      cash[p] *= growth;
      if (option === "uoc" && alive[p] && S >= H) {
        cash[p] += shares[p] * S;
        shares[p] = 0;
        alive[p] = 0;
      }
      if (rebalance) {
        const newShares = alive[p] ? delta(S) : 0;
        cash[p] -= (newShares - shares[p]) * S;
        shares[p] = newShares;
      }
    }
  }

  const pnl = new Float64Array(nPaths);
  for (let p = 0; p < nPaths; p++) {
    const ST = paths[p][steps];
    const payoff = alive[p] ? Math.max(ST - K, 0) : 0;
    pnl[p] = cash[p] + shares[p] * ST - payoff;
  }
  return pnl;
}
