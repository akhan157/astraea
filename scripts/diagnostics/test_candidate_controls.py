#!/usr/bin/env python3
"""Pure manufactured/unit checks for the RMP12b controls checker. Zero native
process calls: these are software checks of the harness and frozen helpers, not
experimental attempts and not numerical/physical qualification.

Usage: python3 scripts/diagnostics/test_candidate_controls.py
"""
import importlib.util
import json
import math
import struct
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parents[2]
RUN_DIR = ROOT / "docs/internal/execution-runs/RMP12-candidate-controls"

spec = importlib.util.spec_from_file_location("cc", HERE.parent / "check-candidate-controls.py")
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

PASSED = []


def check(name):
    def wrap(fn):
        fn()
        PASSED.append(name)
        return fn
    return wrap


@check("equation blocks textually and semantically identical to the original checker")
def _equation_blocks():
    assert cc.equation_block_identity() is True


@check("rk4 matches analytic constant acceleration")
def _rk4():
    rhs = lambda t, y: (y[1], 2.0)
    y1 = cc.rk4(rhs, 0.0, (0.0, 0.0), 0.25)
    # z = v0 t + a t^2/2 = 0.0625, v = a t = 0.5 (exact for polynomial rhs)
    assert abs(y1[0] - 0.0625) < 1e-15 and abs(y1[1] - 0.5) < 1e-15


@check("reference thrust/impulse/mass/density match independent formulas")
def _reference_equations():
    plan = json.loads((RUN_DIR / "EXPERIMENT.json").read_text())
    request = json.loads((RUN_DIR / "BASE-INPUT.json").read_text())
    ref = cc.VerticalReference(request, plan["reference"])
    a, b = ref.curve[3], ref.curve[4]
    t = (a[0] + b[0]) / 2
    assert abs(ref.thrust(t) - (a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]))) < 1e-12
    assert ref.thrust(0) == 0.0 and ref.thrust(ref.motor["burnTime"]) == 0.0
    # Independent trapezoid sum over the same segments
    total = sum((bb[0] - aa[0]) * (aa[1] + bb[1]) / 2 for aa, bb in zip(ref.curve, ref.curve[1:]))
    assert abs(ref.total_impulse - total) < 1e-9
    end = min(t, ref.motor["burnTime"])
    manual = 0.0
    for (ta, fa), (tb, fb) in zip(ref.curve, ref.curve[1:]):
        duration = min(max(end - ta, 0), tb - ta)
        manual += fa * duration + (fb - fa) * duration ** 2 / (2 * (tb - ta))
    assert abs(ref.impulse(t) - manual) < 1e-12
    expected_mass = (plan["reference"]["vehicleDryMassKg"] + ref.motor["dryMass"]
                     + ref.motor["propellantMass"] * (1 - ref.impulse(t) / ref.total_impulse))
    assert abs(ref.mass(t) - expected_mass) < 1e-12
    z = 2.5
    ka, kb = ref.knots
    f = (ref.launch_altitude + z - ka["altitudeM"]) / (kb["altitudeM"] - ka["altitudeM"])
    pressure = math.exp(math.log(ka["pressurePa"]) + f * math.log(kb["pressurePa"] / ka["pressurePa"]))
    assert abs(ref.density(z) - pressure / (plan["reference"]["airGasConstantJkgK"] * ka["temperatureK"])) < 1e-12


@check("manufactured crossing uses the same bisection-from-left-state routine as the rail root")
def _shared_bisector():
    result = cc.manufactured_crossing_check()
    assert result["bracketWidthS"] <= 1e-8
    assert abs(result["estimateS"] - result["exactS"]) <= result["bracketWidthS"] + 1e-15
    assert "bisect_from_left_state" in cc.manufactured_crossing_check.__code__.co_names
    assert "bisect_from_left_state" in cc.reference_rail_root.__code__.co_names


@check("bit-aware leaves: signed zero, int/float, null/missing distinctions")
def _leaf_semantics():
    assert cc.leaf_equal(0.0, 0.0) and cc.leaf_equal(0, 0)
    assert not cc.leaf_equal(0.0, -0.0), "signed zero must differ bitwise"
    assert not cc.leaf_equal(1, 1.0), "int versus float must differ"
    assert not cc.leaf_equal(None, 0.0) and not cc.leaf_equal(None, 0)
    assert not cc.leaf_equal(cc.MISSING, 0.0) and not cc.leaf_equal(cc.MISSING, None)
    assert cc.leaf_equal(1 + 2 ** -52, 1 + 2 ** -52)
    assert not cc.leaf_equal(1.0, 1 + 2 ** -52), "adjacent binary64 values must differ"
    assert cc.leaf_equal(-0.0, -0.0)


@check("changed leaves preserve array order and missing/null/zero distinctions")
def _changed_leaves():
    assert cc.changed_leaves({"a": 1, "b": 2}, {"b": 2, "a": 1}) == []
    assert cc.changed_leaves([1, 2], [2, 1]) == ["[0]", "[1]"]
    assert cc.changed_leaves({}, {"zero": 0, "nil": None}) == ["nil", "zero"]
    assert cc.changed_leaves({"x": 0}, {"x": None}) == ["x"]
    out = cc.changed_leaves({"curve": [{"t": 0}]}, {"curve": [{"t": 1}, {"t": 2}]})
    assert out == ["curve[0].t", "curve[1]"]


@check("declared delta entries resolve to concrete leaves, including [-1] and subtrees")
def _expand_declared():
    a = {"env": {"knots": [{"alt": 1}, {"alt": 2}], "validity": {"until": 5}}, "diag": None}
    b = {"env": {"knots": [{"alt": 1}, {"alt": 100}], "validity": {"until": 5}},
         "diag": {"schemaId": "s", "split": True}}
    leaves = cc.expand_declared(a, b, ["env.knots[-1].alt", "diag"])
    assert leaves == {"env.knots[1].alt", "diag"}, leaves
    assert set(cc.changed_leaves(a, b)) == leaves
    # The one frozen alias resolves the bare controls entry to the nested DTO location.
    nested_a = {"candidate": {"motor": 1}}
    nested_b = {"candidate": {"motor": 1, "diagnosticNumerics": {"p": True}}}
    assert cc.expand_declared(nested_a, nested_b, ["diagnosticNumerics"]) == {"candidate.diagnosticNumerics"}
    assert set(cc.changed_leaves(nested_a, nested_b)) == {"candidate.diagnosticNumerics"}
    # An undeclared extra change must not be covered
    c = dict(b)
    c["env"] = {"knots": [{"alt": 9}, {"alt": 100}], "validity": {"until": 5}}
    assert set(cc.changed_leaves(a, c)) != cc.expand_declared(a, c, ["env.knots[-1].alt", "diag"])


@check("frozen case builders and delta sets match the reviewed plan exactly")
def _cases():
    plan = json.loads((RUN_DIR / "EXPERIMENT.json").read_text())
    base_bytes = (RUN_DIR / "BASE-INPUT.json").read_bytes()
    assert cc.sha(base_bytes) == plan["baseInputSha256"]
    assert json.dumps(json.loads(base_bytes), indent=2).encode() + b"\n" == base_bytes, \
        "base input must round-trip byte-exactly"
    cases = cc.build_case_requests(base_bytes, plan)
    assert "diagnosticNumerics" not in cases["A-inherited-absent"]
    assert "diagnosticNumerics" not in cases["A-inherited-absent"]["candidate"]
    for cid, request in cases.items():
        assert set(request) == set(json.loads(base_bytes)), f"{cid} gained root-level keys"
    for cid in ("B-inherited-explicit", "C-knots-only", "D-tolerance-only", "E-knots-and-tolerance"):
        assert set(cases[cid]["candidate"]["diagnosticNumerics"]) == {
            "schemaId", "absoluteTolerancePolicy", "splitAtThrustKnots"}
    assert cases["C-knots-only"]["candidate"]["diagnosticNumerics"]["splitAtThrustKnots"] is True
    assert cases["D-tolerance-only"]["candidate"]["diagnosticNumerics"]["absoluteTolerancePolicy"] == "hundredth"
    f = cases["F-fractional-expiry"]
    assert f["candidate"]["horizonSeconds"] == 2.003
    assert f["candidate"]["diagnosticNumerics"]["splitAtThrustKnots"] is True
    assert f["environmentSelection"]["profile"]["validity"]["untilUtcUnixS"] == \
        f["environmentSelection"]["launchTimeUtcUnixS"] + 2
    g = cases["G-speculative-altitude"]
    assert g["environmentSelection"]["profile"]["knots"][-1]["altitudeM"] == 100
    deltas = cc.verify_delta_sets(cases, plan)
    assert all(row["match"] for row in deltas.values())
    assert deltas["A-inherited-absent"]["observed"] == []
    assert deltas["B-inherited-explicit"]["observed"] == ["candidate.diagnosticNumerics"]
    assert deltas["B-inherited-explicit"]["resolvedDeclared"] == ["candidate.diagnosticNumerics"]
    assert deltas["F-fractional-expiry"]["observed"] == [
        "candidate.diagnosticNumerics",
        "candidate.horizonSeconds",
        "environmentSelection.profile.validity.untilUtcUnixS"]
    assert deltas["G-speculative-altitude"]["observed"] == [
        "candidate.diagnosticNumerics", "environmentSelection.profile.knots[1].altitudeM"]


@check("report comparison strips only the frozen blocks, never whole echoes")
def _report_compare():
    a = {"contentIdentity": {"sha256": "a"}, "activePolicies": {"x": 1},
         "effectiveInputs": {"candidate": {"motor": 1, "diagnosticNumerics": {"p": 1}}, "motor": {"t": 2}},
         "body": {"z": 1.0}}
    old = {"effectiveInputs": {"candidate": {"motor": 1}, "motor": {"t": 2}}, "body": {"z": 1.0}}
    assert cc.compare_reports(a, old, skip_top=("contentIdentity", "activePolicies"),
                              skip_paths=("effectiveInputs.candidate.diagnosticNumerics",)) == []
    drifted = {"effectiveInputs": {"candidate": {"motor": 1}, "motor": {"t": 3}}, "body": {"z": 1.0}}
    assert cc.compare_reports(a, drifted, skip_top=("contentIdentity", "activePolicies"),
                              skip_paths=("effectiveInputs.candidate.diagnosticNumerics",)) == ["effectiveInputs.motor.t"]
    b = dict(a)
    b["effectiveInputs"] = {"candidate": {"motor": 1, "diagnosticNumerics": {"p": 2}}, "motor": {"t": 2}}
    assert cc.compare_reports(a, b, skip_top=("contentIdentity", "activePolicies"),
                              skip_paths=("effectiveInputs.candidate.diagnosticNumerics",)) == []


@check("reference rail root bracket is within the frozen 1e-8 s and records its left state")
def _rail_root():
    plan = json.loads((RUN_DIR / "EXPERIMENT.json").read_text())
    request = json.loads((RUN_DIR / "BASE-INPUT.json").read_text())
    ref = cc.VerticalReference(request, plan["reference"])
    times = [0.2, 0.5, 1.0, 1.5, 2.0]
    root = cc.reference_rail_root(ref, times, 0.0002)
    assert root["bracketWidthS"] <= 1e-8 and root["converged"]
    assert root["leftTimeS"] < root["bracketS"][0] <= root["estimateS"] <= root["bracketS"][1]
    fine = cc.reference_rail_root(ref, times, 0.0001)
    assert abs(root["estimateS"] - fine["estimateS"]) < 1e-6, "coarse/fine roots should agree closely"
    assert root["leftState"] == [0.0, 0.0] or root["leftState"][0] < ref.rail_length


if __name__ == "__main__":
    print(f"{len(PASSED)} checks passed (zero native process calls)")
    for name in PASSED:
        print(f"  ok  {name}")
