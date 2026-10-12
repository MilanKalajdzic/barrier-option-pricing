"""Pricing and hedging an up-and-out barrier call option.

Scalar inputs return NumPy scalars; array inputs return arrays of the same shape.
"""

from barrier_pricing.analytical import BGK_BETA, bgk_barrier, bs_call, bs_call_delta, uoc_call

__all__ = ["BGK_BETA", "bgk_barrier", "bs_call", "bs_call_delta", "uoc_call"]
