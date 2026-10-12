import numpy as np
import pytest

from barrier_pricing.hedging import delta_hedge_pnl
from barrier_pricing.mc import simulate_paths

S0, K, H, R, SIGMA, T = 100.0, 100.0, 130.0, 0.05, 0.20, 1.0


@pytest.fixture(scope="module")
def paths():
    return simulate_paths(S0, R, SIGMA, T, 252, 5000, rng=7)


def pnl(option, paths, every):
    return delta_hedge_pnl(option, paths, K, H, R, SIGMA, T, rebalance_every=every)


def unbiased(x):
    return abs(x.mean()) < 4 * x.std() / np.sqrt(len(x))


def test_vanilla_hedge_error_shrinks_with_rebalancing(paths):
    stds = [pnl("vanilla", paths, k).std() for k in (21, 5, 1)]  # ≈ 1.92, 0.94, 0.44
    assert stds[0] > stds[1] > stds[2]


def test_vanilla_hedge_is_unbiased(paths):
    assert unbiased(pnl("vanilla", paths, 1))


def test_uoc_hedge_finite_and_unbiased(paths):
    x = pnl("uoc", paths, 5)
    assert x.shape == (5000,) and np.isfinite(x).all() and unbiased(x)


def test_uoc_hedge_has_fatter_left_tail(paths):
    u, v = pnl("uoc", paths, 1), pnl("vanilla", paths, 1)
    assert np.quantile(u, 0.01) < 2 * np.quantile(v, 0.01)  # ≈ -4.3 vs -1.1


def test_invalid_option_raises(paths):
    with pytest.raises(ValueError):
        pnl("put", paths, 1)
