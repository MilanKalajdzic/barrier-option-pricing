"""Pricing and hedging an up-and-out barrier call option.

Scalar inputs return NumPy scalars; array inputs return arrays of the same shape.
"""

from barrier_pricing.analytical import BGK_BETA, bgk_barrier, bs_call, bs_call_delta, uoc_call
from barrier_pricing.greeks import uoc_delta, uoc_gamma
from barrier_pricing.hedging import delta_hedge_pnl
from barrier_pricing.mc import MCResult, price_barrier_mc, simulate_paths
from barrier_pricing.tree import crr_uoc

__all__ = [
    "BGK_BETA",
    "MCResult",
    "bgk_barrier",
    "bs_call",
    "bs_call_delta",
    "crr_uoc",
    "delta_hedge_pnl",
    "price_barrier_mc",
    "simulate_paths",
    "uoc_call",
    "uoc_delta",
    "uoc_gamma",
]
