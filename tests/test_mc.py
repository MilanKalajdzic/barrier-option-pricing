import numpy as np
import pytest

from barrier_pricing.analytical import bgk_barrier, bs_call, uoc_call
from barrier_pricing.mc import MCResult, price_barrier_mc, simulate_paths

S0, K, H, R, SIGMA, T, STEPS = 100.0, 100.0, 130.0, 0.05, 0.20, 1.0, 252
CLOSED = uoc_call(S0, K, H, R, SIGMA, T)


def mc(**kw):
    args = dict(S0=S0, K=K, H=H, r=R, sigma=SIGMA, T=T, steps=STEPS, n_paths=100_000, rng=1)
    return price_barrier_mc(**{**args, **kw})


def test_ci95():
    assert MCResult(price=1.0, std_error=0.1, n_paths=10).ci95 == pytest.approx((0.804, 1.196))


def test_simulate_paths_shape_and_start():
    p = simulate_paths(S0, R, SIGMA, T, STEPS, 1000, rng=0)
    assert p.shape == (1000, STEPS + 1) and (p[:, 0] == S0).all() and (p > 0).all()


def test_simulate_paths_reproducible():
    a = simulate_paths(S0, R, SIGMA, T, 12, 100, rng=3)
    np.testing.assert_array_equal(a, simulate_paths(S0, R, SIGMA, T, 12, 100, rng=3))


def test_simulate_paths_discounted_mean_is_spot():
    p = simulate_paths(S0, R, SIGMA, T, 12, 200_000, rng=0)
    assert np.exp(-R * T) * p[:, -1].mean() == pytest.approx(S0, abs=0.3)


def test_bridge_matches_closed_form():
    res = mc(method="bridge")
    assert abs(res.price - CLOSED) < 4 * res.std_error


def test_bridge_unbiased_with_coarse_monitoring():
    res = mc(method="bridge", steps=12, n_paths=200_000)
    assert abs(res.price - CLOSED) < 4 * res.std_error


def test_discrete_price_sits_above_continuous():
    assert mc(rng=3).price > CLOSED + 0.15  # missed crossings between daily checks


def test_discrete_matches_closed_form_at_discrete_equivalent_barrier():
    res = mc(rng=3)
    target = uoc_call(S0, K, bgk_barrier(H, SIGMA, T / STEPS, "discrete"), R, SIGMA, T)
    assert abs(res.price - target) < 4 * res.std_error


def test_discrete_with_continuous_bgk_shift_near_closed_form():
    res = mc(H=bgk_barrier(H, SIGMA, T / STEPS, "continuous"), rng=2)
    assert abs(res.price - CLOSED) < 0.05


def test_antithetic_std_error_uses_pairs_and_beats_plain():
    anti = mc(n_paths=50_000, rng=4)
    plain = mc(n_paths=50_000, antithetic=False, rng=4)
    assert anti.std_error < 0.9 * plain.std_error  # naive per-path SE would be ≈ plain SE


def test_knock_in_out_parity():
    res = mc(method="bridge", knock="in", rng=5)
    assert abs(res.price - (bs_call(S0, K, R, SIGMA, T) - CLOSED)) < 4 * res.std_error


def test_control_variate_not_worse():
    base, cv = mc(rng=6), mc(rng=6, control_variate=True)
    assert cv.std_error <= base.std_error
    assert abs(cv.price - base.price) < 4 * base.std_error


def test_odd_paths_with_antithetic_raises():
    with pytest.raises(ValueError):
        mc(n_paths=1001)


def test_odd_paths_without_antithetic_ok():
    assert mc(n_paths=1001, antithetic=False, steps=12).n_paths == 1001


@pytest.mark.parametrize("kw", [{"method": "euler"}, {"knock": "sideways"}])
def test_invalid_options_raise(kw):
    with pytest.raises(ValueError):
        mc(n_paths=1000, steps=12, **kw)


@pytest.mark.parametrize("method", ["discrete", "bridge"])
@pytest.mark.parametrize("spot", [130.0, 135.0])
def test_spot_at_or_above_barrier_is_worthless(spot, method):
    res = mc(S0=spot, method=method, n_paths=1000, steps=12)
    assert res.price == 0.0 and res.std_error == 0.0
