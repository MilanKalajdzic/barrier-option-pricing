// The simulations behind the page's Monte Carlo cards and hedging panel. DOM-free, so they
// run in the Web Worker (worker.js) and in Node tests alike.

import { priceBarrierMC, simulatePaths } from "./mc.js";
import { deltaHedgePnl } from "./hedging.js";
import { bgkBarrier, bsCall, uocCall } from "./pricing.js";

// Why the contract can never pay, or null if it can.
export function deadReason(c) {
  if (c.S0 >= c.H) return "the spot is at or above the barrier";
  if (c.K >= c.H) return "the strike is at or above the barrier, so it is knocked out before it can pay";
  return null;
}

// The pricer's closed-form cards. `perYear` is the number of barrier checks per year, or null
// for a continuously checked barrier (the simulation grid is then daily). A dead contract is
// worth 0 under every monitoring convention, including at the BGK-shifted barrier.
export function closedFormPrices(c, perYear) {
  const steps = Math.max(1, Math.round(c.T * (perYear ?? 252)));
  const shifted = bgkBarrier(c.H, c.sigma, c.T / steps, "discrete");
  const vanilla = bsCall(c.S0, c.K, c.r, c.sigma, c.T);
  const reason = deadReason(c);
  if (reason) return { steps, shifted, cont: 0, monitored: 0, vanilla, discount: 1, deadReason: reason };
  const cont = uocCall(c.S0, c.K, c.H, c.r, c.sigma, c.T);
  const monitored = perYear ? uocCall(c.S0, c.K, shifted, c.r, c.sigma, c.T) : cont;
  const discount = vanilla > 0 ? 1 - monitored / vanilla : null;
  return { steps, shifted, cont, monitored, vanilla, discount, deadReason: null };
}

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
// `dead` is true when there is nothing meaningful to hedge: `reason` is "worthless" when the
// contract can never pay, "negligible" when its premium is under 0.01% of the spot (P&L
// divided by such a premium is noise).
export function hedgingStudy({ contract: c, rebalanceDays, nPaths, seed }) {
  const steps = Math.max(1, Math.round(252 * c.T));
  const Hmodel = bgkBarrier(c.H, c.sigma, c.T / steps, "discrete");
  const premium = {
    vanilla: bsCall(c.S0, c.K, c.r, c.sigma, c.T),
    uoc: uocCall(c.S0, c.K, Hmodel, c.r, c.sigma, c.T),
  };
  if (deadReason(c)) return { dead: true, reason: "worthless", relPnl: null };
  if (!(premium.uoc >= 1e-4 * c.S0)) return { dead: true, reason: "negligible", relPnl: null };

  const paths = simulatePaths({ S0: c.S0, mu: c.r, sigma: c.sigma, T: c.T, steps, nPaths, seed });
  const relPnl = {};
  for (const option of ["vanilla", "uoc"]) {
    relPnl[option] = rebalanceDays.map((k) =>
      deltaHedgePnl(option, paths, { ...c, rebalanceEvery: k }).map((x) => x / premium[option]),
    );
  }
  return { dead: false, reason: null, relPnl };
}
