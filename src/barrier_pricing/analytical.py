"""Closed-form prices under Black-Scholes / GBM with no dividends.

All pricers accept a scalar or an array of spot prices and return the same shape.
"""

from typing import Literal

import numpy as np
from scipy.stats import norm

# Broadie-Glasserman-Kou (1997) continuity-correction constant: -zeta(1/2) / sqrt(2*pi),
# where zeta is the Riemann zeta function.
BGK_BETA = 0.5826


def bs_call(S, K: float, r: float, sigma: float, T: float):
    """Black-Scholes price of a European call."""
    S = np.asarray(S, dtype=float)
    if T <= 0:
        return np.maximum(S - K, 0.0)
    sqrt_T = np.sqrt(T)
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T
    return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)


def bs_call_delta(S, K: float, r: float, sigma: float, T: float):
    """Black-Scholes delta of a European call, N(d1)."""
    S = np.asarray(S, dtype=float)
    if T <= 0:
        return (S > K).astype(float)[()]
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    return norm.cdf(d1)


def uoc_call(S, K: float, H: float, r: float, sigma: float, T: float):
    """Up-and-out call with a continuously monitored barrier H (Haug 2007).

    The option is worthless once the spot reaches H, and always worthless if K >= H.
    """
    S = np.asarray(S, dtype=float)
    if T <= 0:
        return np.maximum(S - K, 0.0) * (S < H)
    if K >= H:
        return np.zeros_like(S)[()]

    mu = (r - 0.5 * sigma**2) / sigma**2
    vol = sigma * np.sqrt(T)
    disc_K = K * np.exp(-r * T)

    x1 = np.log(S / K) / vol + (1 + mu) * vol
    x2 = np.log(S / H) / vol + (1 + mu) * vol
    y1 = np.log(H**2 / (S * K)) / vol + (1 + mu) * vol
    y2 = np.log(H / S) / vol + (1 + mu) * vol
    up = (H / S) ** (2 * (mu + 1))
    down = (H / S) ** (2 * mu)

    A = S * norm.cdf(x1) - disc_K * norm.cdf(x1 - vol)
    B = S * norm.cdf(x2) - disc_K * norm.cdf(x2 - vol)
    C = S * up * norm.cdf(-y1) - disc_K * down * norm.cdf(-y1 + vol)
    D = S * up * norm.cdf(-y2) - disc_K * down * norm.cdf(-y2 + vol)

    # Clip: A - B + C - D cancels to ~1e-15 (either sign) as S approaches H.
    return np.where(S < H, np.maximum(A - B + C - D, 0.0), 0.0)[()]


def bgk_barrier(
    H: float, sigma: float, dt: float, target: Literal["continuous", "discrete"]
) -> float:
    """Broadie-Glasserman-Kou continuity correction for an up barrier.

    target="continuous": the barrier to use in a simulation (or tree) monitored every dt
        so that it approximates the continuously monitored price. Shifts H down.
    target="discrete": the barrier to put into the continuous closed form so that it
        prices a contract monitored every dt (e.g. at each daily close). Shifts H up.
    """
    shift = np.exp(BGK_BETA * sigma * np.sqrt(dt))
    if target == "continuous":
        return float(H / shift)
    if target == "discrete":
        return float(H * shift)
    raise ValueError(f"target must be 'continuous' or 'discrete', got {target!r}")
