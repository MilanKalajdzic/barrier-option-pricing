"""Write reference.json: outputs of the Python package that the JavaScript port must reproduce.

Run from the repository root: python web/tests/make_reference.py
"""

import itertools
import json
from pathlib import Path

from barrier_pricing import bgk_barrier, bs_call, bs_call_delta, uoc_call, uoc_delta, uoc_gamma

FUNCTIONS = {
    "bsCall": bs_call,
    "bsCallDelta": bs_call_delta,
    "uocCall": uoc_call,
    "uocDelta": uoc_delta,
    "uocGamma": uoc_gamma,
    "bgkBarrier": bgk_barrier,
}

H, R = 130.0, 0.05
MATURITIES = [3.0, 1.0, 1 / 12, 5 / 252, 1 / 252, 0.0]
VOLS = [0.05, 0.2, 0.6]


def cases():
    for fn in ("uocCall", "uocDelta", "uocGamma"):
        spots = [60, 80, 95, 100, 110, 125, 129.9, 130, 140]
        for S, K, T, sigma in itertools.product(spots, [100, 140], MATURITIES, VOLS):
            yield fn, [float(S), float(K), H, R, sigma, T]
    for fn in ("bsCall", "bsCallDelta"):
        for S, T, sigma in itertools.product([60, 100, 140], MATURITIES, VOLS):
            yield fn, [float(S), 100.0, R, sigma, T]
    intervals = [1 / 252, 1 / 52, 1 / 12]
    for sigma, dt, target in itertools.product(VOLS, intervals, ["continuous", "discrete"]):
        yield "bgkBarrier", [H, sigma, dt, target]


def main():
    out = [
        {"fn": fn, "args": args, "expected": float(FUNCTIONS[fn](*args))} for fn, args in cases()
    ]
    path = Path(__file__).with_name("reference.json")
    path.write_text(json.dumps({"cases": out}, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} cases to {path}")


if __name__ == "__main__":
    main()
