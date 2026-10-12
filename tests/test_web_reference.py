import json
from pathlib import Path

import pytest

from barrier_pricing import bgk_barrier, bs_call, bs_call_delta, uoc_call, uoc_delta, uoc_gamma

REFERENCE = Path(__file__).parents[1] / "web" / "tests" / "reference.json"
FUNCTIONS = {
    "bsCall": bs_call,
    "bsCallDelta": bs_call_delta,
    "uocCall": uoc_call,
    "uocDelta": uoc_delta,
    "uocGamma": uoc_gamma,
    "bgkBarrier": bgk_barrier,
}
CASES = json.loads(REFERENCE.read_text(encoding="utf-8"))["cases"]
# reference.json is generated on one machine and checked on others (CI runs Linux), whose maths
# libraries can differ by an ulp. Gamma divides price differences by eps**2 = 1e-4, so an ulp
# in a price moves it by ~1e-11. These tolerances absorb that; a real formula change moves
# values by far more.
TOLERANCE = {"uocGamma": {"abs": 1e-9}}
DEFAULT_TOLERANCE = {"rel": 1e-9, "abs": 1e-12}


def test_reference_covers_every_function():
    assert {c["fn"] for c in CASES} == set(FUNCTIONS) and len(CASES) > 1000


@pytest.mark.parametrize("case", CASES, ids=lambda c: f"{c['fn']}{c['args']}")
def test_reference_matches_package(case):
    got = float(FUNCTIONS[case["fn"]](*case["args"]))
    tolerance = TOLERANCE.get(case["fn"], DEFAULT_TOLERANCE)
    assert got == pytest.approx(case["expected"], **tolerance)
