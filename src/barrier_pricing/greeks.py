"""Delta and gamma of the up-and-out call by central finite differences of the closed form."""

import numpy as np

from barrier_pricing.analytical import uoc_call


def uoc_delta(S, K: float, H: float, r: float, sigma: float, T: float, eps: float = 1e-2):
    """dV/dS of the up-and-out call."""
    S = np.asarray(S, dtype=float)
    up = uoc_call(S + eps, K, H, r, sigma, T)
    down = uoc_call(S - eps, K, H, r, sigma, T)
    return (up - down) / (2 * eps)


def uoc_gamma(S, K: float, H: float, r: float, sigma: float, T: float, eps: float = 1e-2):
    """d2V/dS2 of the up-and-out call."""
    S = np.asarray(S, dtype=float)
    up = uoc_call(S + eps, K, H, r, sigma, T)
    mid = uoc_call(S, K, H, r, sigma, T)
    down = uoc_call(S - eps, K, H, r, sigma, T)
    return (up - 2 * mid + down) / eps**2
