import math

import numpy as np
import pytest
from scipy.special import zeta

from barrier_pricing.analytical import BGK_BETA, bgk_barrier, bs_call, bs_call_delta, uoc_call

S0, K, H, R, SIGMA, T = 100.0, 100.0, 130.0, 0.05, 0.20, 1.0
DT = T / 252


def test_bs_call_base_case():
    assert bs_call(S0, K, R, SIGMA, T) == pytest.approx(10.4506, abs=1e-4)


def test_bs_call_delta_base_case():
    assert bs_call_delta(S0, K, R, SIGMA, T) == pytest.approx(0.6368, abs=1e-4)


def test_bs_at_expiry_is_intrinsic():
    S = np.array([90.0, 110.0])
    np.testing.assert_allclose(bs_call(S, K, R, SIGMA, 0.0), [0.0, 10.0])
    np.testing.assert_allclose(bs_call_delta(S, K, R, SIGMA, 0.0), [0.0, 1.0])


def test_uoc_base_case():
    assert uoc_call(S0, K, H, R, SIGMA, T) == pytest.approx(3.3329, abs=1e-4)


def test_uoc_far_barrier_is_vanilla():
    vanilla = bs_call(S0, K, R, SIGMA, T)
    assert uoc_call(S0, K, 1e6, R, SIGMA, T) == pytest.approx(vanilla, abs=1e-8)


@pytest.mark.parametrize("spot", [130.0, 140.0])
def test_uoc_zero_at_or_above_barrier(spot):
    assert uoc_call(spot, K, H, R, SIGMA, T) == 0.0


@pytest.mark.parametrize("strike", [130.0, 140.0])
def test_uoc_zero_when_strike_at_or_above_barrier(strike):
    assert uoc_call(S0, strike, H, R, SIGMA, T) == 0.0


def test_uoc_expiry_is_intrinsic_below_barrier():
    S = np.array([90.0, 110.0, 135.0])
    np.testing.assert_allclose(uoc_call(S, K, H, R, SIGMA, 0.0), [0.0, 10.0, 0.0])


def test_uoc_mixed_spots_elementwise():
    v = uoc_call(np.array([90.0, 129.9, 130.0, 150.0]), K, H, R, SIGMA, T)
    assert v.shape == (4,) and np.isfinite(v).all()
    assert v[0] > 0 and v[1] >= 0 and v[2] == 0 and v[3] == 0


def test_bgk_beta_is_zeta_constant():
    assert BGK_BETA == pytest.approx(-zeta(0.5) / math.sqrt(2 * math.pi), abs=1e-4)


def test_bgk_barrier_directions():
    shift = math.exp(BGK_BETA * SIGMA * math.sqrt(DT))
    assert bgk_barrier(H, SIGMA, DT, "continuous") == pytest.approx(H / shift)  # ≈ 129.0493
    assert bgk_barrier(H, SIGMA, DT, "discrete") == pytest.approx(H * shift)
    with pytest.raises(ValueError):
        bgk_barrier(H, SIGMA, DT, "sideways")
