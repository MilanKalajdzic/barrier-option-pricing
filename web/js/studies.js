// The simulations behind the page's Monte Carlo cards and hedging panel. DOM-free, so they
// run in the Web Worker (worker.js) and in Node tests alike.

import { priceBarrierMC, simulatePaths } from "./mc.js";
import { deltaHedgePnl } from "./hedging.js";
import { bgkBarrier, bsCall, uocCall } from "./pricing.js";

// Brownian-bridge price (continuous barrier) and, if `discrete`, the price with the barrier
// checked only at the `steps` monitoring dates, on the same seeded draws.
export function pricerSimulations({ contract, steps, nPaths, seed, discrete }) {
  const args = { ...contract, steps, nPaths, seed };
  return {
    discrete: discrete ? priceBarrierMC({ ...args, method: "discrete" }) : null,
    bridge: priceBarrierMC({ ...args, method: "bridge" }),
  };
}

// Delta-hedging P&L, as a fraction of the premium received, for the vanilla call and the
// daily-monitored up-and-out call, at every rebalancing frequency, on the same paths.
// `dead` is true when the barrier option is worthless, so there is nothing to hedge.
export function hedgingStudy({ contract: c, rebalanceDays, nPaths, seed }) {
  const steps = Math.max(1, Math.round(252 * c.T));
  const Hmodel = bgkBarrier(c.H, c.sigma, c.T / steps, "discrete");
  const premium = {
    vanilla: bsCall(c.S0, c.K, c.r, c.sigma, c.T),
    uoc: uocCall(c.S0, c.K, Hmodel, c.r, c.sigma, c.T),
  };
  if (c.S0 >= c.H || c.K >= c.H || !(premium.uoc > 1e-6)) return { dead: true, relPnl: null };

  const paths = simulatePaths({ S0: c.S0, mu: c.r, sigma: c.sigma, T: c.T, steps, nPaths, seed });
  const relPnl = {};
  for (const option of ["vanilla", "uoc"]) {
    relPnl[option] = rebalanceDays.map((k) =>
      deltaHedgePnl(option, paths, { ...c, rebalanceEvery: k }).map((x) => x / premium[option]),
    );
  }
  return { dead: false, relPnl };
}
