"""Monte Carlo pricing of up-and-out / up-and-in calls under GBM."""

from dataclasses import dataclass
from typing import Literal

import numpy as np

from barrier_pricing.analytical import bs_call


@dataclass(frozen=True)
class MCResult:
    """A Monte Carlo estimate with its standard error."""

    price: float
    std_error: float
    n_paths: int

    @property
    def ci95(self) -> tuple[float, float]:
        half_width = 1.96 * self.std_error
        return self.price - half_width, self.price + half_width


def simulate_paths(
    S0: float,
    mu: float,
    sigma: float,
    T: float,
    steps: int,
    n_paths: int,
    rng: np.random.Generator | int | None = None,
) -> np.ndarray:
    """Exact GBM paths with drift mu, shape (n_paths, steps + 1); column 0 is S0."""
    rng = np.random.default_rng(rng)
    dt = T / steps
    z = rng.standard_normal((n_paths, steps))
    log_steps = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z
    paths = np.empty((n_paths, steps + 1))
    paths[:, 0] = S0
    paths[:, 1:] = S0 * np.exp(np.cumsum(log_steps, axis=1))
    return paths


def price_barrier_mc(
    S0: float,
    K: float,
    H: float,
    r: float,
    sigma: float,
    T: float,
    steps: int,
    n_paths: int,
    *,
    knock: Literal["out", "in"] = "out",
    method: Literal["discrete", "bridge"] = "discrete",
    antithetic: bool = True,
    control_variate: bool = False,
    rng: np.random.Generator | int | None = None,
) -> MCResult:
    """Price an up-and-out (or up-and-in) call by simulation under the risk-neutral measure.

    method="discrete" checks the barrier only at the `steps` monitoring dates, i.e. it prices
    a discretely monitored contract. method="bridge" multiplies in the Brownian-bridge
    probability that each step stayed below H, which prices the continuously monitored
    contract without discretisation bias at any step count.

    With antithetic=True the estimator and its standard error are computed on the averages of
    each (Z, -Z) pair, which are the independent samples. With control_variate=True the
    discounted vanilla payoff, whose mean is known (Black-Scholes), is used as a control.
    """
    if knock not in ("out", "in"):
        raise ValueError(f"knock must be 'out' or 'in', got {knock!r}")
    if method not in ("discrete", "bridge"):
        raise ValueError(f"method must be 'discrete' or 'bridge', got {method!r}")
    if antithetic and n_paths % 2:
        raise ValueError(f"n_paths must be even with antithetic=True, got {n_paths}")

    rng = np.random.default_rng(rng)
    dt = T / steps
    drift = (r - 0.5 * sigma**2) * dt
    vol = sigma * np.sqrt(dt)
    log_H = np.log(H)

    x = np.full(n_paths, np.log(S0))
    survival = np.full(n_paths, 1.0 if S0 < H else 0.0)
    for _ in range(steps):
        z = rng.standard_normal(n_paths // 2 if antithetic else n_paths)
        if antithetic:
            z = np.concatenate([z, -z])
        x_new = x + drift + vol * z
        if method == "discrete":
            survival *= x_new < log_H
        else:
            a, b = log_H - x, log_H - x_new
            ab = np.maximum(a, 0.0) * np.maximum(b, 0.0)  # >= 0, so exp() cannot overflow
            p_cross = np.where((a > 0) & (b > 0), np.exp(-2.0 * ab / (sigma**2 * dt)), 1.0)
            survival *= 1.0 - p_cross
        x = x_new

    weight = survival if knock == "out" else 1.0 - survival
    vanilla = np.exp(-r * T) * np.maximum(np.exp(x) - K, 0.0)
    y = vanilla * weight
    if antithetic:
        half = n_paths // 2
        y = 0.5 * (y[:half] + y[half:])
        vanilla = 0.5 * (vanilla[:half] + vanilla[half:])
    if control_variate:
        cov = np.cov(y, vanilla)
        c = cov[0, 1] / cov[1, 1] if cov[1, 1] > 0 else 0.0
        y = y - c * (vanilla - bs_call(S0, K, r, sigma, T))

    return MCResult(
        price=float(y.mean()),
        std_error=float(y.std(ddof=1) / np.sqrt(len(y))),
        n_paths=n_paths,
    )
