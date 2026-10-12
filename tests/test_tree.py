import numpy as np
import pytest

from barrier_pricing.analytical import bs_call, uoc_call
from barrier_pricing.tree import crr_uoc

S0, K, H, R, SIGMA, T = 100.0, 100.0, 130.0, 0.05, 0.20, 1.0
CLOSED = uoc_call(S0, K, H, R, SIGMA, T)
STEP_RANGE = range(100, 401)


def test_far_barrier_tree_matches_black_scholes():
    vanilla = bs_call(S0, K, R, SIGMA, T)
    assert crr_uoc(S0, K, 1e6, R, SIGMA, T, 500) == pytest.approx(vanilla, abs=0.05)


def test_plain_tree_is_biased_up_on_average():
    mean = np.mean([crr_uoc(S0, K, H, R, SIGMA, T, n) for n in STEP_RANGE])
    assert mean - CLOSED > 0.1  # ≈ +0.205


def test_bgk_tree_is_close_on_average():
    mean = np.mean([crr_uoc(S0, K, H, R, SIGMA, T, n, bgk=True) for n in STEP_RANGE])
    assert abs(mean - CLOSED) < 0.1  # ≈ -0.047


def test_tree_spot_at_barrier_is_worthless():
    assert crr_uoc(130.0, K, H, R, SIGMA, T, 252) == 0.0
