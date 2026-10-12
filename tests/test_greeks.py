import numpy as np
import pytest

from barrier_pricing.analytical import bs_call_delta
from barrier_pricing.greeks import uoc_delta, uoc_gamma

S0, K, H, R, SIGMA, T = 100.0, 100.0, 130.0, 0.05, 0.20, 1.0


def test_far_barrier_delta_is_bs_delta():
    vanilla = bs_call_delta(S0, K, R, SIGMA, T)
    assert uoc_delta(S0, K, 1e6, R, SIGMA, T) == pytest.approx(vanilla, abs=1e-4)


def test_delta_positive_at_spot_negative_near_barrier():
    assert uoc_delta(100.0, K, H, R, SIGMA, T) > 0  # ≈ +0.036
    assert uoc_delta(125.0, K, H, R, SIGMA, T) < 0


def test_gamma_changes_sign():
    assert uoc_gamma(75.0, K, H, R, SIGMA, T) > 0  # ≈ +0.0065
    assert uoc_gamma(100.0, K, H, R, SIGMA, T) < 0  # ≈ -0.0120


def test_greeks_are_vectorised():
    S = np.linspace(80.0, 120.0, 5)
    assert uoc_delta(S, K, H, R, SIGMA, T).shape == (5,)
    assert uoc_gamma(S, K, H, R, SIGMA, T).shape == (5,)
