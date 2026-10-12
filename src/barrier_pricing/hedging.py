"""Discrete delta hedging of a short call position along simulated paths."""

from typing import Literal

import numpy as np

from barrier_pricing.analytical import bgk_barrier, bs_call, bs_call_delta, uoc_call
from barrier_pricing.greeks import uoc_delta


def delta_hedge_pnl(
    option: Literal["uoc", "vanilla"],
    paths: np.ndarray,
    K: float,
    H: float,
    r: float,
    sigma: float,
    T: float,
    *,
    rebalance_every: int,
) -> np.ndarray:
    """Terminal P&L of selling one option at model price and delta hedging it with the stock.

    `paths` has shape (n_paths, steps + 1), as returned by `simulate_paths`; each column is one
    monitoring date. The up-and-out contract is knocked out at the first date with S >= H
    (checked every step, whatever the rebalancing frequency); the stock position is then sold
    and the path is no longer hedged. Its price and delta come from the closed form evaluated at
    the BGK-shifted barrier, so the model matches the discretely monitored contract. Cash earns
    the risk-free rate. `H` is ignored for the vanilla call.
    """
    n_paths, steps = paths.shape[0], paths.shape[1] - 1
    dt = T / steps
    S0 = paths[0, 0]

    if option == "uoc":
        H_model = bgk_barrier(H, sigma, dt, "discrete")

        def value(S, tau):
            return uoc_call(S, K, H_model, r, sigma, tau)

        def delta(S, tau):
            return uoc_delta(S, K, H_model, r, sigma, tau)
    elif option == "vanilla":

        def value(S, tau):
            return bs_call(S, K, r, sigma, tau)

        def delta(S, tau):
            return bs_call_delta(S, K, r, sigma, tau)
    else:
        raise ValueError(f"option must be 'uoc' or 'vanilla', got {option!r}")

    shares = np.full(n_paths, float(delta(S0, T)))
    cash = float(value(S0, T)) - shares * S0
    alive = np.full(n_paths, S0 < H) if option == "uoc" else np.ones(n_paths, dtype=bool)

    for i in range(1, steps + 1):
        S = paths[:, i]
        cash = cash * np.exp(r * dt)
        if option == "uoc":
            knocked = alive & (S >= H)
            cash[knocked] += shares[knocked] * S[knocked]
            shares[knocked] = 0.0
            alive &= ~knocked
        if i < steps and i % rebalance_every == 0:
            new_shares = np.where(alive, delta(S, T - i * dt), 0.0)
            cash -= (new_shares - shares) * S
            shares = new_shares

    S_T = paths[:, -1]
    payoff = np.maximum(S_T - K, 0.0) * alive
    return cash + shares * S_T - payoff
