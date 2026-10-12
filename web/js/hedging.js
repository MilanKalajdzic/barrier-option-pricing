// Discrete delta hedging of a short call along simulated paths: a port of
// src/barrier_pricing/hedging.py with the same conventions.

import { bgkBarrier, bsCall, bsCallDelta, uocCall, uocDelta } from "./pricing.js";

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

  let value;
  let delta;
  if (option === "uoc") {
    const Hmodel = bgkBarrier(H, sigma, dt, "discrete");
    value = (S, tau) => uocCall(S, K, Hmodel, r, sigma, tau);
    delta = (S, tau) => uocDelta(S, K, Hmodel, r, sigma, tau);
  } else if (option === "vanilla") {
    value = (S, tau) => bsCall(S, K, r, sigma, tau);
    delta = (S, tau) => bsCallDelta(S, K, r, sigma, tau);
  } else {
    throw new Error(`option must be "uoc" or "vanilla", got ${JSON.stringify(option)}`);
  }

  const growth = Math.exp(r * dt);
  const premium = value(S0, T);
  const delta0 = delta(S0, T);
  const pnl = new Float64Array(nPaths);

  for (let p = 0; p < nPaths; p++) {
    const path = paths[p];
    let shares = delta0;
    let cash = premium - shares * S0;
    let alive = option === "uoc" ? S0 < H : true;
    for (let i = 1; i <= steps; i++) {
      const S = path[i];
      cash *= growth;
      if (option === "uoc" && alive && S >= H) {
        cash += shares * S;
        shares = 0;
        alive = false;
      }
      if (i < steps && i % rebalanceEvery === 0) {
        const newShares = alive ? delta(S, T - i * dt) : 0;
        cash -= (newShares - shares) * S;
        shares = newShares;
      }
    }
    const ST = path[steps];
    const payoff = alive ? Math.max(ST - K, 0) : 0;
    pnl[p] = cash + shares * ST - payoff;
  }
  return pnl;
}
