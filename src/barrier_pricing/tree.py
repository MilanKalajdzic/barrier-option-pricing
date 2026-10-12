"""Cox-Ross-Rubinstein binomial tree for the up-and-out call."""

import numpy as np

from barrier_pricing.analytical import bgk_barrier


def crr_uoc(
    S0: float,
    K: float,
    H: float,
    r: float,
    sigma: float,
    T: float,
    n_steps: int,
    *,
    bgk: bool = False,
) -> float:
    """Up-and-out call on a CRR tree, knocked out at every node with S >= H.

    The barrier rarely falls exactly on a row of nodes, so the effective barrier moves as
    n_steps changes and the price oscillates. bgk=True shifts H down by the BGK correction,
    which removes the systematic upward bias but not the oscillation.
    """
    dt = T / n_steps
    if bgk:
        H = bgk_barrier(H, sigma, dt, "continuous")
    u = np.exp(sigma * np.sqrt(dt))
    d = 1.0 / u
    p = (np.exp(r * dt) - d) / (u - d)
    disc = np.exp(-r * dt)

    j = np.arange(n_steps + 1)
    S_T = S0 * u**j * d ** (n_steps - j)
    V = np.maximum(S_T - K, 0.0) * (S_T < H)
    for i in range(n_steps - 1, -1, -1):
        j = np.arange(i + 1)
        S_node = S0 * u**j * d ** (i - j)
        V = disc * (p * V[1:] + (1.0 - p) * V[:-1]) * (S_node < H)
    return float(V[0])
