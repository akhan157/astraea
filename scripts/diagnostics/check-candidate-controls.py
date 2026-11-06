#!/usr/bin/env python3
"""RMP12b candidate-only diagnostic-controls experiment: frozen 7 profile + 1
legacy process attempts, no retries. Reads the reviewed plan and RUN-SEAL; a
missing/stale seal, changed source/binary/input, or non-fresh output refuses.

Usage: check-candidate-controls.py PROFILE_EXAMPLE LEGACY_EXAMPLE RETAINED_BASELINE_STDOUT OUTPUT_DIR

Integrity status is separate from per-configuration provisional reserve status.
This is a synthetic software experiment: no adaptive-tolerance convergence,
full-6D, physical, source, empirical, native-WASM or mission qualification, and
no production default selection. The retained default failure is never removed.
"""
import ast
import hashlib
import json
import math
import os
import re
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN_DIR = ROOT / "docs/internal/execution-runs/RMP12-candidate-controls"
PLAN_PATH = RUN_DIR / "EXPERIMENT.json"
SEAL_PATH = RUN_DIR / "RUN-SEAL.json"
OLD_CHECKER = ROOT / "scripts/diagnostics/check-candidate-numerics.py"
SIDECAR_PREFIX = "MECHANISM_SIDECAR_JSON:"
NEGATIVE_MESSAGE_KEYS = {
    "F-fractional-expiry": "fractional stage time",
    "G-speculative-altitude": "outside tabulated coverage",
}
INHERITED_LITERALS = {"rM": 1e-3, "vMps": 1e-2, "qUnit": 1e-5, "wRadps": 1e-3}
# The frozen caseDeltaSets spells the controls entry bare ("diagnosticNumerics");
# the contract places it on the strict native candidate DTO, which lives under
# "candidate" in the profile envelope. One fail-closed alias, applied only to
# declared entries: strict observed==expected equality then aborts if the change
# occurs at the root, at both locations, or at neither.
FROZEN_ENTRY_ALIASES = {"diagnosticNumerics": "candidate.diagnosticNumerics"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


# ==== EQUATION BLOCKS: textually identical to check-candidate-numerics.py ====
# >>> EQ rk4
def rk4(rhs, t, y, h):
    a = rhs(t, y)
    b = rhs(t + h / 2, tuple(v + h * w / 2 for v, w in zip(y, a)))
    c = rhs(t + h / 2, tuple(v + h * w / 2 for v, w in zip(y, b)))
    d = rhs(t + h, tuple(v + h * w for v, w in zip(y, c)))
    return tuple(v + h * (aa + 2 * bb + 2 * cc + dd) / 6
                 for v, aa, bb, cc, dd in zip(y, a, b, c, d))
# <<< EQ rk4

# >>> EQ VerticalReference
class VerticalReference:
    """Continuous drag ODE, not a transcription of the DP5/event algorithm."""
    def __init__(self, request, constants):
        c = request["candidate"]
        self.motor = c["motor"]
        self.curve = [(p["time"], p["thrust"]) for p in self.motor["thrustCurve"]]
        self.dry = constants["vehicleDryMassKg"]
        self.area = constants["areaM2"]
        self.g = constants["gMps2"]
        self.gas = constants["airGasConstantJkgK"]
        self.ca = c["axial"]["ca0"]
        selection = request["environmentSelection"]
        self.launch_altitude = selection["launchAltitudeGeometricMslM"]
        self.knots = selection["profile"]["knots"]
        self.rail_length = c["launch"]["railLengthM"]
        # Only this deliberately reduced fixture is a reference domain.
        assert c["launch"]["railElevationDeg"] == 90
        assert len(self.knots) == 2
        assert self.knots[0]["temperatureK"] == self.knots[1]["temperatureK"]
        assert all(all(v == 0 for v in k["windTowardEnuMps"].values()) for k in self.knots)
        self.total_impulse = sum((b[0] - a[0]) * (a[1] + b[1]) / 2
                                 for a, b in zip(self.curve, self.curve[1:]))
        assert self.total_impulse > 0
        # Find the first positive thrust-weight interval and bisect its first
        # crossing. Impulse depletion continues during stationary contact.
        self.liftoff = None
        for a, b in zip(self.curve, self.curve[1:]):
            # The selected fixture rises monotonically until liftoff. Reject
            # a different contact history rather than silently generalizing.
            assert b[1] >= a[1], "reference requires rising pre-liftoff thrust"
            if self.thrust(b[0]) > self.mass(b[0]) * self.g:
                assert self.thrust(a[0]) <= self.mass(a[0]) * self.g
                lo, hi = a[0], b[0]
                for _ in range(80):
                    mid = (lo + hi) / 2
                    if self.thrust(mid) > self.mass(mid) * self.g:
                        hi = mid
                    else:
                        lo = mid
                self.liftoff = (lo + hi) / 2
                break
        assert self.liftoff is not None

    def thrust(self, t):
        if t <= 0 or t >= self.motor["burnTime"]:
            return 0.0
        for (ta, fa), (tb, fb) in zip(self.curve, self.curve[1:]):
            if ta <= t <= tb:
                return fa + (fb - fa) * (t - ta) / (tb - ta)
        raise AssertionError("thrust query outside frozen segments")

    def impulse(self, t):
        # Integrate each linear segment analytically using its slope. No native
        # curve integration, scalar fitting or observed trajectory enters here.
        end = min(max(t, 0), self.motor["burnTime"])
        value = 0.0
        for (ta, fa), (tb, fb) in zip(self.curve, self.curve[1:]):
            duration = min(max(end - ta, 0), tb - ta)
            value += fa * duration + (fb - fa) * duration ** 2 / (2 * (tb - ta))
        return value

    def mass(self, t):
        return (self.dry + self.motor["dryMass"]
                + self.motor["propellantMass"] * (1 - self.impulse(t) / self.total_impulse))

    def density(self, z):
        a, b = self.knots
        f = (self.launch_altitude + z - a["altitudeM"]) / (b["altitudeM"] - a["altitudeM"])
        assert 0 <= f <= 1, "reference outside supplied altitude domain"
        pressure = math.exp(math.log(a["pressurePa"]) + f * math.log(b["pressurePa"] / a["pressurePa"]))
        return pressure / (self.gas * a["temperatureK"])

    def rhs(self, t, y):
        z, v = y
        drag = .5 * self.density(z) * self.area * self.ca * v * abs(v)
        acceleration = (self.thrust(t) - drag) / self.mass(t) - self.g
        return v, acceleration

    def integrate(self, times, max_step):
        assert max_step > 0 and all(math.isfinite(t) and t >= 0 for t in times)
        targets = sorted(set(times))
        boundaries = sorted(set(targets + [self.liftoff] + [t for t, _ in self.curve]
                                + [self.motor["burnTime"]]))
        t, y = 0.0, (0.0, 0.0)
        values, rail = {}, None
        for stop in boundaries:
            if stop > targets[-1]:
                break
            if stop <= self.liftoff:
                t, y = stop, (0.0, 0.0)
            else:
                while t < stop:
                    h = min(max_step, stop - t)
                    nt = min(t + h, stop)
                    assert nt > t, "reference cannot make representable progress"
                    ny = rk4(self.rhs, t, y, nt - t)
                    if rail is None and y[0] < self.rail_length <= ny[0]:
                        f = (self.rail_length - y[0]) / (ny[0] - y[0])
                        rail = {"estimateS": t + f * (nt - t), "bracketS": [t, nt],
                                "bracketWidthS": nt - t}
                    t, y = nt, ny
            if stop in targets:
                values[stop] = y
        assert set(values) == set(targets)
        return values, rail
# <<< EQ VerticalReference
# ==== END EQUATION BLOCKS ====


def equation_block_identity():
    """The gate bound into the seal: the equation blocks above must remain
    textually and semantically identical to the original independent checker."""
    def blocks(path):
        src = Path(path).read_text()
        tree = ast.parse(src)
        out = {}
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == "rk4":
                out["rk4"] = ast.get_source_segment(src, node)
            if isinstance(node, ast.ClassDef) and node.name == "VerticalReference":
                out["VerticalReference"] = ast.get_source_segment(src, node)
        return out, tree
    mine, my_tree = blocks(Path(__file__))
    theirs, _ = blocks(OLD_CHECKER)
    assert set(mine) == set(theirs) == {"rk4", "VerticalReference"}
    for key in mine:
        assert mine[key] == theirs[key], f"equation block {key} is textually different"
        assert ast.dump(ast.parse(mine[key])) == ast.dump(ast.parse(theirs[key])), \
            f"equation block {key} is semantically different"
    return True


# ---- New machinery: one shared bisection-from-left-state root routine. Both
# the rail root and the manufactured closed-form crossing use THIS function. ----
def bisect_from_left_state(rhs, left_t, left_y, lo, hi, crossed,
                           max_iterations=80, bracket_max_s=1e-8):
    """RK4 reintegration from ONE fixed left grid state to each trial time.
    Returns a numerical bracket of the implemented stepping routine: NOT the
    exact ODE root and NOT a rigorous global error bound."""
    assert hi > lo >= left_t
    assert not crossed(rk4(rhs, left_t, left_y, lo - left_t)), "lo already crosses"
    assert crossed(rk4(rhs, left_t, left_y, hi - left_t)), "hi does not cross"
    iterations = 0
    while hi - lo > bracket_max_s and iterations < max_iterations:
        mid = (lo + hi) / 2
        if crossed(rk4(rhs, left_t, left_y, mid - left_t)):
            hi = mid
        else:
            lo = mid
        iterations += 1
    return {"estimateS": (lo + hi) / 2, "bracketS": [lo, hi], "bracketWidthS": hi - lo,
            "iterations": iterations, "leftTimeS": left_t, "leftState": list(left_y),
            "converged": hi - lo <= bracket_max_s}


def manufactured_crossing_check():
    """Closed-form crossing exercised through the SAME routine as the rail root."""
    def rhs(_t, y):
        return (y[1], 0.0)
    z0, v, rail = 1.25, 40.0, 3.0
    exact = (rail - z0) / v
    root = bisect_from_left_state(rhs, 0.0, (z0, v), 0.0, 2 * exact,
                                  lambda s: s[0] >= rail)
    assert abs(root["estimateS"] - exact) <= root["bracketWidthS"] + 1e-15, root
    assert root["bracketWidthS"] <= 1e-8 and root["converged"]
    return {"exactS": exact, "estimateS": root["estimateS"], "bracketWidthS": root["bracketWidthS"]}


def reference_rail_root(ref, targets, max_step):
    """Walk reference steps exactly as VerticalReference.integrate does and
    refine the first positive-velocity rail crossing with the shared routine."""
    targets = sorted(set(targets))
    boundaries = sorted(set(targets + [ref.liftoff] + [t for t, _ in ref.curve]
                            + [ref.motor["burnTime"]]))
    t, y = 0.0, (0.0, 0.0)
    for stop in boundaries:
        if stop > targets[-1]:
            break
        if stop <= ref.liftoff:
            t, y = stop, (0.0, 0.0)
        else:
            while t < stop:
                h = min(max_step, stop - t)
                nt = min(t + h, stop)
                assert nt > t
                ny = rk4(ref.rhs, t, y, nt - t)
                if y[0] < ref.rail_length <= ny[0] and ny[1] > 0:
                    return bisect_from_left_state(
                        ref.rhs, t, y, t, nt, lambda s: s[0] >= ref.rail_length and s[1] > 0)
                t, y = nt, ny
    raise AssertionError("reference never crossed the rail positively")


# ---- Bit-aware recursive comparison: binary64 bits (signed zero distinct),
# integers exact, int-vs-float is a difference, not Python == semantics. ----
MISSING = object()


def leaf_equal(a, b):
    if a is MISSING or b is MISSING:
        return False
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, int) and isinstance(b, int):
        return a == b
    if isinstance(a, float) and isinstance(b, float):
        return struct.pack(">d", a) == struct.pack(">d", b)
    return type(a) is type(b) and a == b


def changed_leaves(a, b, path="", out=None):
    """Exact changed-leaf paths in dotted/array notation, including additions."""
    if out is None:
        out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b)):
            changed_leaves(a.get(key, MISSING), b.get(key, MISSING),
                           f"{path}.{key}" if path else key, out)
    elif isinstance(a, list) and isinstance(b, list):
        for i in range(max(len(a), len(b))):
            changed_leaves(a[i] if i < len(a) else MISSING,
                           b[i] if i < len(b) else MISSING, f"{path}[{i}]", out)
    elif not leaf_equal(a, b):
        out.append(path or "$")
    return out


def expand_declared(a, b, declared):
    """Concrete changed-leaf paths authorized by the frozen declared entries,
    in the same notation as changed_leaves (dotted keys, concrete [i] indices).
    A [-1] entry resolves against the actual array; a subtree entry expands to
    all of its leaves."""
    leaves = set()
    for entry in declared:
        entry = FROZEN_ENTRY_ALIASES.get(entry, entry)
        node_a, node_b = a, b
        canonical = ""
        for token in re.findall(r"[^.\[\]]+|\[-?\d+\]", entry):
            if token.startswith("["):
                raw = int(token[1:-1])
                ia = raw if raw >= 0 else (len(node_a) + raw if isinstance(node_a, list) else raw)
                ib = raw if raw >= 0 else (len(node_b) + raw if isinstance(node_b, list) else raw)
                node_a = node_a[ia] if isinstance(node_a, list) and -len(node_a) <= ia < len(node_a) else MISSING
                node_b = node_b[ib] if isinstance(node_b, list) and -len(node_b) <= ib < len(node_b) else MISSING
                canonical += f"[{ib}]"
            else:
                node_a = node_a.get(token, MISSING) if isinstance(node_a, dict) else MISSING
                node_b = node_b.get(token, MISSING) if isinstance(node_b, dict) else MISSING
                canonical += f".{token}" if canonical else token
        one_sided = (node_a is MISSING) != (node_b is MISSING)
        if one_sided or not isinstance(node_a, (dict, list)) or not isinstance(node_b, (dict, list)):
            # Added/removed containers are one changed leaf (the changed_leaves
            # convention); scalar/None leaves resolve to their concrete path.
            leaves.add(canonical)
        else:
            leaves |= set(changed_leaves(node_a, node_b, canonical))
    return leaves


def compare_reports(a, b, skip_top=(), skip_paths=()):
    """Bit-aware structural diff of two report objects. Returns changed leaves,
    skipping only the named top-level blocks and paths (never whole echoes)."""
    sa = {k: v for k, v in a.items() if k not in skip_top}
    sb = {k: v for k, v in b.items() if k not in skip_top}
    for path in skip_paths:
        for obj in (sa, sb):
            node = obj
            tokens = path.split(".")
            for token in tokens[:-1]:
                node = node.get(token, {}) if isinstance(node, dict) else {}
            if isinstance(node, dict):
                node.pop(tokens[-1], None)
    return changed_leaves(sa, sb)


# ---- Frozen case construction: A omits the field entirely; B-G set the strict
# object; only declared mutations touch anything else. ----
def build_case_requests(base_bytes, plan):
    base = json.loads(base_bytes)
    cases = {}
    for case in plan["cases"]:
        cid = case["id"]
        if cid == "A-inherited-absent":
            request = json.loads(json.dumps(base))
        else:
            request = json.loads(json.dumps(base))
            d = case["diagnosticNumerics"]
            assert d["schemaId"] == "candidate-native-diagnostic-controls/1.0.0"
            assert set(d) == {"schemaId", "absoluteTolerancePolicy", "splitAtThrustKnots"}
            # Strict DTO location: nested under the native candidate request,
            # never at the profile document root (deny_unknown_fields there).
            request["candidate"]["diagnosticNumerics"] = {
                "schemaId": d["schemaId"],
                "absoluteTolerancePolicy": d["absoluteTolerancePolicy"],
                "splitAtThrustKnots": d["splitAtThrustKnots"],
            }
            if cid == "F-fractional-expiry":
                assert case["mutation"] == "environmentSelection.profile.validity.untilUtcUnixS=launchTimeUtcUnixS+2"
                s = request["environmentSelection"]
                s["profile"]["validity"]["untilUtcUnixS"] = s["launchTimeUtcUnixS"] + 2
                request["candidate"]["horizonSeconds"] = case["horizonS"]
            elif cid == "G-speculative-altitude":
                assert case["mutation"] == "environmentSelection.profile.knots[-1].altitudeM=100"
                request["environmentSelection"]["profile"]["knots"][-1]["altitudeM"] = 100
        cases[cid] = request
    assert "diagnosticNumerics" not in cases["A-inherited-absent"]
    assert "diagnosticNumerics" not in cases["A-inherited-absent"]["candidate"]
    for cid, request in cases.items():
        assert set(request) == set(base), f"{cid} gained root-level keys"
    return cases


def case_delta_key(plan, cid):
    """The frozen caseDeltaSets uses the reviewed short keys A-G; resolve the
    case id to exactly one of them or refuse."""
    keys = [k for k in plan["caseDeltaSets"] if cid == k or cid.startswith(k + "-")]
    assert len(keys) == 1, f"ambiguous caseDeltaSets key for case {cid}"
    return keys[0]


def verify_delta_sets(cases, plan):
    """Fail-closed: every case's changed leaves equal exactly its frozen set."""
    a = cases["A-inherited-absent"]
    out = {}
    for case in plan["cases"]:
        cid = case["id"]
        declared = plan["caseDeltaSets"][case_delta_key(plan, cid)]
        observed = set(changed_leaves(a, cases[cid]))
        expected = expand_declared(a, cases[cid], declared)
        out[cid] = {"declared": declared,
                    "resolvedDeclared": sorted({FROZEN_ENTRY_ALIASES.get(e, e) for e in declared}),
                    "observed": sorted(observed), "expected": sorted(expected),
                    "match": observed == expected}
        assert observed == expected, f"{cid} request delta set mismatch: {sorted(observed)} != {sorted(expected)}"
    return out


def fsync_json(path, value):
    data = (json.dumps(value, indent=2) + "\n").encode()
    with open(path, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    return sha(data)


def run_attempt(binary, cid, raw_input, output, expected_kind):
    """One process attempt with a durable pre-spawn reservation. Never retries."""
    reservations = output / "reservations"
    reservations.mkdir(exist_ok=True)
    reservation = {"id": cid, "inputSha256": sha(raw_input),
                   "binarySha256": sha(Path(binary).read_bytes()),
                   "expectedKind": expected_kind}
    reservation_sha = fsync_json(reservations / f"{cid}.reservation.json", reservation)
    row = {"id": cid, "reservationSha256": reservation_sha, "inputSha256": reservation["inputSha256"],
           "pass": False, "expected": expected_kind}
    try:
        proc = subprocess.run([str(binary), "-"], input=raw_input, capture_output=True, timeout=30)
        (output / f"{cid}.stdout").write_bytes(proc.stdout)
        (output / f"{cid}.stderr").write_bytes(proc.stderr)
        row.update(exitCode=proc.returncode, stdoutSha256=sha(proc.stdout), stderrSha256=sha(proc.stderr))
        try:
            row["sidecar"] = parse_sidecar(proc.stderr)
        except (ValueError, AssertionError) as exc:
            row["sidecar"] = None
            row["sidecarError"] = repr(exc)
        return row, proc
    except subprocess.TimeoutExpired as exc:
        (output / f"{cid}.stdout").write_bytes(exc.stdout or b"")
        (output / f"{cid}.stderr").write_bytes(exc.stderr or b"")
        row["error"] = "native process exceeded 30 s; subprocess killed/waited, no retry"
        return row, None


def parse_sidecar(stderr):
    for line in stderr.decode(errors="replace").splitlines():
        if line.startswith(SIDECAR_PREFIX):
            sidecar = json.loads(line[len(SIDECAR_PREFIX):])
            assert sidecar["location"] == "per-attempt sidecar outside the compared candidate report"
            return sidecar
    return None


# ---- Reference comparison: adapted semantics from the original checker, with
# the reviewed rail-root refinement and the model-mismatch floor reported. ----
def compare_case(report, request, plan):
    r = plan["reserves"]
    floor = plan["modelMismatchFloorMps2"]
    tr = report["trajectory"]
    assert report["effectiveInputs"] == request
    assert report["mechanical"]["dryMassKg"] == plan["reference"]["vehicleDryMassKg"]
    assert report["geometry"]["areaM2"] == plan["reference"]["areaM2"]
    assert tr["finalTimeS"] == request["candidate"]["horizonSeconds"]
    assert tr["termination"] == "TimeLimit"
    assert tr["computationalCompletion"] == "CompletedRequestedHorizon"
    assert tr["empiricalQualification"] == "Unqualified" and tr["dynamicQualification"] == "Unknown"
    assert tr["landing"] is None and tr["apogeeEvent"] is None
    assert not any(tr["finalFlags"].values())
    samples = tr["samples"]
    times = [s["timeS"] for s in samples] + [tr["finalTimeS"]] + [e["timeS"] for e in report["events"]]
    ref = VerticalReference(request, plan["reference"])
    coarse, _ = ref.integrate(times, plan["reference"]["maxStepsS"][0])
    fine, _ = ref.integrate(times, plan["reference"]["maxStepsS"][1])
    coarse_rail = reference_rail_root(ref, times, plan["reference"]["maxStepsS"][0])
    fine_rail = reference_rail_root(ref, times, plan["reference"]["maxStepsS"][1])
    metrics = {"referencePositionDeltaM": max(abs(coarse[t][0] - fine[t][0]) for t in fine),
               "referenceVelocityDeltaMps": max(abs(coarse[t][1] - fine[t][1]) for t in fine),
               "referenceRailDeltaS": abs(coarse_rail["estimateS"] - fine_rail["estimateS"]),
               "referenceRail": fine_rail, "referenceRailCoarse": coarse_rail,
               "liftoffReferenceS": ref.liftoff,
               "maxPositionErrorM": 0.0, "maxVelocityErrorMps": 0.0,
               "maxTransversePositionM": 0.0, "maxTransverseVelocityMps": 0.0,
               "maxRateRadps": 0.0, "maxQuaternionChord": 0.0,
               "maxMassErrorKg": 0.0, "committedSamplesCompared": len(samples),
               "modelMismatchFloorMps2": floor}
    q0 = (math.sqrt(.5), math.sqrt(.5), 0, 0)
    states = [(s["timeS"], s["state"]) for s in samples] + [(tr["finalTimeS"], tr["finalState"])]
    for t, s in states:
        z, v = fine[t]
        metrics["maxPositionErrorM"] = max(metrics["maxPositionErrorM"], abs(s["positionM"][2] - z))
        metrics["maxVelocityErrorMps"] = max(metrics["maxVelocityErrorMps"], abs(s["velocityMps"][2] - v))
        metrics["maxTransversePositionM"] = max(metrics["maxTransversePositionM"], math.hypot(*s["positionM"][:2]))
        metrics["maxTransverseVelocityMps"] = max(metrics["maxTransverseVelocityMps"], math.hypot(*s["velocityMps"][:2]))
        metrics["maxRateRadps"] = max(metrics["maxRateRadps"], math.hypot(*s["omegaRadps"]))
        metrics["maxQuaternionChord"] = max(metrics["maxQuaternionChord"],
                                            min(math.dist(s["quaternionWxyz"], q0),
                                                math.dist(s["quaternionWxyz"], [-x for x in q0])))
    for s in samples:
        metrics["maxMassErrorKg"] = max(metrics["maxMassErrorKg"],
                                        abs(s["mechanics"]["massKg"] - ref.mass(s["timeS"])))
    rail = next(e for e in report["events"] if e["name"] == "Launch Rail Departure")
    burn = next(e for e in report["events"] if e["name"] == "Motor Burnout")
    assert len(report["events"]) == 3
    assert burn["timeS"] == request["candidate"]["motor"]["burnTime"]
    metrics["railTimeErrorS"] = abs(rail["timeS"] - fine_rail["estimateS"])
    metrics["railEventTimeS"] = rail["timeS"]
    metrics["railTimeErrorModelMismatchFloorMps2"] = floor
    metrics["railRootAtSampleTimes"] = [s["timeS"] for s in samples
                                        if rail["timeS"] - 0.02 <= s["timeS"] <= rail["timeS"] + 0.02]
    for e in (rail, burn):
        z, v = fine[e["timeS"]]
        metrics["maxPositionErrorM"] = max(metrics["maxPositionErrorM"], abs(e["altitudeAglM"] - z))
        metrics["maxVelocityErrorMps"] = max(metrics["maxVelocityErrorMps"], abs(e["velocityMps"] - v))
    metrics["cornerSampleErrors"] = [
        {"timeS": s["timeS"],
         "positionErrorM": abs(s["state"]["positionM"][2] - fine[s["timeS"]][0]),
         "velocityErrorMps": abs(s["state"]["velocityMps"][2] - fine[s["timeS"]][1])}
        for s in samples if 0.15 <= s["timeS"] <= 0.30]
    for row in metrics["cornerSampleErrors"]:
        row["modelMismatchFloorMps2"] = floor
    tests = {"referencePositionDeltaM": r["referencePositionM"],
             "referenceVelocityDeltaMps": r["referenceVelocityMps"],
             "referenceRailDeltaS": r["referenceRailTimeS"],
             "maxPositionErrorM": r["positionM"], "maxVelocityErrorMps": r["velocityMps"],
             "railTimeErrorS": r["railTimeS"], "maxTransversePositionM": r["transversePositionM"],
             "maxTransverseVelocityMps": r["transverseVelocityMps"], "maxRateRadps": r["rateRadps"],
             "maxQuaternionChord": r["quaternionChord"], "maxMassErrorKg": 1e-14}
    metrics["checks"] = {key: {"observed": metrics[key], "reserve": limit,
                               "pass": math.isfinite(metrics[key]) and metrics[key] <= limit}
                         for key, limit in tests.items()}
    metrics["checks"]["railTimeErrorS"]["modelMismatchFloorMps2"] = floor
    metrics["diagnosticPass"] = all(v["pass"] for v in metrics["checks"].values())
    metrics["anyReserveFailed"] = not metrics["diagnosticPass"]
    metrics["finalReference"] = {"zM": fine[tr["finalTimeS"]][0], "vzMps": fine[tr["finalTimeS"]][1]}
    return metrics


def refusal_check(row, proc, case, cid):
    assert proc is not None and proc.returncode == 1, f"{cid} did not refuse as frozen"
    message = proc.stderr.decode(errors="replace")
    key = NEGATIVE_MESSAGE_KEYS[cid]
    assert key in message, f"{cid} refusal reason changed: {message}"
    assert "adaptive-endpoint-stage; speculative=true" in message, message
    match = re.search(r"at t=([0-9.eE+-]+) s", message)
    assert match, message
    stage_time = float(match.group(1))
    assert 0 < stage_time <= case["horizonS"] if "horizonS" in case else stage_time > 0
    if cid == "F-fractional-expiry":
        assert stage_time > 2
    row.update(pass_=True, failurePhase="adaptive-endpoint-stage", speculative=True,
               failureStageTimeS=stage_time, refusalMessageSha256=sha(message.encode()))
    row["pass"] = row.pop("pass_")
    row["observedDisposition"] = "refusal with frozen reason/phase"


def main(profile_binary, legacy_binary, retained_baseline, output_dir):
    assert equation_block_identity(), "equation block identity gate failed"
    plan_bytes = PLAN_PATH.read_bytes()
    plan = json.loads(plan_bytes)
    assert SEAL_PATH.exists(), "RUN-SEAL missing; do not run unsealed"
    seal = json.loads(SEAL_PATH.read_text())
    assert seal["experimentSha256"] == sha(plan_bytes), "plan changed after sealing"
    assert seal["contractSha256"] == sha((RUN_DIR / "CONTRACT.md").read_bytes()), "contract changed after sealing"
    for rel, digest in seal["sources"].items():
        assert sha((ROOT / rel).read_bytes()) == digest, f"source changed after sealing: {rel}"
    for rel, digest in seal["checker"].items():
        assert sha((ROOT / rel).read_bytes()) == digest, f"checker changed after sealing: {rel}"
    assert sha(Path(profile_binary).read_bytes()) == seal["binaries"]["profileExample"]["sha256"], "profile binary changed"
    assert sha(Path(legacy_binary).read_bytes()) == seal["binaries"]["legacyExample"]["sha256"], "legacy binary changed"
    toolchain = {"rustc": subprocess.check_output(["rustc", "--version"], text=True).strip(),
                 "cargo": subprocess.check_output(["cargo", "--version"], text=True).strip()}
    assert toolchain == seal["toolchain"], f"toolchain differs from seal: {toolchain}"
    # Frozen input names live beside the plan in the run directory.
    assert sha((RUN_DIR / plan["baseInput"]).read_bytes()) == plan["baseInputSha256"]
    assert sha((RUN_DIR / plan["legacy"]["input"]).read_bytes()) == plan["legacy"]["inputSha256"]
    retained = Path(retained_baseline).read_bytes()
    assert sha(retained) == plan["retainedBaselineStdoutSha256"], "retained baseline stdout changed; never regenerate"
    assert len(plan["cases"]) == plan["nativeProfileProcessBudget"] == 7
    assert plan["legacyProcessBudget"] == 1 and plan["totalProcessBudget"] == 8 and plan["retries"] == 0

    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=False)
    (output / "experiment.json").write_bytes(plan_bytes)
    (output / "run-seal.json").write_bytes(SEAL_PATH.read_bytes())

    base_bytes = (RUN_DIR / plan["baseInput"]).read_bytes()
    assert json.dumps(json.loads(base_bytes), indent=2).encode() + b"\n" == base_bytes, \
        "base input must round-trip byte-exactly"
    cases = build_case_requests(base_bytes, plan)
    delta_sets = verify_delta_sets(cases, plan)

    ledger, reports, sidecars, metrics_by_case = [], {}, {}, {}
    for case in plan["cases"]:
        cid = case["id"]
        raw_input = json.dumps(cases[cid], indent=2).encode() + b"\n"
        (output / f"{cid}.input.json").write_bytes(raw_input)
        row, proc = run_attempt(profile_binary, cid, raw_input, output, case["expected"])
        row["deltaSet"] = delta_sets[cid]["declared"]
        row["deltaSetMatch"] = delta_sets[cid]["match"]
        try:
            if proc is None:
                raise AssertionError(row.get("error", "no process"))
            if case["expected"].startswith("prefix-success"):
                assert proc.returncode == 0, proc.stderr.decode(errors="replace")
                report = json.loads(proc.stdout)
                assert report.get("error") is None
                assert not any(k in report for k in ("cutKnotsS", "clippedTrials", "stepWindowTrials", "mechanism")), \
                    "mechanism evidence leaked into the compared candidate report"
                assert row["sidecar"] is not None, "missing mechanism sidecar"
                row["metrics"] = compare_case(report, cases[cid], plan)
                metrics_by_case[cid] = row["metrics"]
                row["pass"] = True
                row["observedDisposition"] = "prefix-success with complete report and sidecar"
                reports[cid], sidecars[cid] = report, row["sidecar"]
            else:
                refusal_check(row, proc, case, cid)
        except (AssertionError, ValueError, KeyError, TypeError, IndexError, OverflowError, StopIteration) as exc:
            row["error"] = repr(exc)
        ledger.append(row)
        fsync_json(output / "attempts.json", ledger)

    legacy_request_bytes = (RUN_DIR / plan["legacy"]["input"]).read_bytes()
    legacy_row = {"id": "H-legacy-byte-preservation", "pass": False,
                  "expected": plan["legacy"]["purpose"]}
    reservations = output / "reservations"
    legacy_res = {"id": legacy_row["id"], "inputSha256": sha(legacy_request_bytes),
                  "binarySha256": sha(Path(legacy_binary).read_bytes()),
                  "expectedKind": plan["legacy"]["purpose"]}
    legacy_row["reservationSha256"] = fsync_json(reservations / "H-legacy-byte-preservation.reservation.json", legacy_res)
    legacy_input_path = output / "H-legacy-byte-preservation.input.json"
    legacy_input_path.write_bytes(legacy_request_bytes)
    try:
        proc = subprocess.run([str(legacy_binary), str(legacy_input_path)],
                              capture_output=True, timeout=30)
        (output / "H-legacy-byte-preservation.stdout").write_bytes(proc.stdout)
        (output / "H-legacy-byte-preservation.stderr").write_bytes(proc.stderr)
        legacy_row.update(exitCode=proc.returncode, stdoutSha256=sha(proc.stdout),
                          stderrSha256=sha(proc.stderr), sidecar=parse_sidecar(proc.stderr))
        assert proc.returncode == 0
        assert sha(proc.stdout) == plan["legacy"]["expectedStdoutSha256"], "legacy bytes changed"
        assert legacy_row["sidecar"] is None, "legacy path must emit no diagnostic sidecar"
        legacy_row["pass"] = True
        legacy_row["observedDisposition"] = "byte-identical legacy output"
    except (AssertionError, ValueError, subprocess.TimeoutExpired) as exc:
        legacy_row["error"] = repr(exc)
    ledger.append(legacy_row)
    fsync_json(output / "attempts.json", ledger)

    # ---- Comparisons (frozen rules) ----
    comparisons = {}
    a = reports.get("A-inherited-absent")
    if a is not None:
        old = json.loads(retained)
        comparisons["A_vs_retained_old"] = {
            "changedLeaves": compare_reports(a, old, skip_top=("contentIdentity", "activePolicies"),
                                            skip_paths=("effectiveInputs.candidate.diagnosticNumerics",)),
            "rule": "strip only contentIdentity/activePolicies; effectiveInputs compared with only the diagnosticNumerics leaf removed",
        }
        b = reports.get("B-inherited-explicit")
        if b is not None:
            comparisons["A_vs_B"] = {
                "changedLeaves": compare_reports(a, b, skip_top=("contentIdentity", "activePolicies"),
                                                skip_paths=("effectiveInputs.candidate.diagnosticNumerics",)),
                "identityDiffers": a["contentIdentity"]["sha256"] != b["contentIdentity"]["sha256"],
                "bPolicyId": b["contentIdentity"]["envelope"]["numericalPolicyId"],
                "bAppliedEqualsInheritedLiterals": changed_leaves(
                    INHERITED_LITERALS,
                    b["contentIdentity"]["envelope"]["numericalDiagnostics"]["appliedAbsoluteTolerances"]) == [],
                "rule": "physical report bit-exact; identity must differ; explicit-inherited never reuses the inherited policy ID",
            }
        c_to_g = {}
        for cid in ("C-knots-only", "D-tolerance-only", "E-knots-and-tolerance"):
            report = reports.get(cid)
            if report is None or a is None:
                continue
            declared = [e for e in plan["caseDeltaSets"][case_delta_key(plan, cid)] if e != "diagnosticNumerics"]
            def strip_diag(e):
                e = json.loads(json.dumps(e))
                e.get("candidate", {}).pop("diagnosticNumerics", None)
                e.pop("diagnosticNumerics", None)
                return e
            observed = set(changed_leaves(strip_diag(a["effectiveInputs"]), strip_diag(report["effectiveInputs"])))
            expected = expand_declared(strip_diag(a["effectiveInputs"]), strip_diag(report["effectiveInputs"]), declared)
            c_to_g[cid] = {"declaredWithoutDiagnosticNumerics": declared,
                          "observedEffectiveInputChanges": sorted(observed),
                          "match": observed == expected}
        comparisons["C_to_E_effectiveInputs"] = c_to_g

    # ---- Pairwise 2x2 effects on reference metrics ----
    pairwise = {}
    for left, right in (("A-inherited-absent", "C-knots-only"),
                        ("A-inherited-absent", "D-tolerance-only"),
                        ("C-knots-only", "E-knots-and-tolerance"),
                        ("D-tolerance-only", "E-knots-and-tolerance"),
                        ("B-inherited-explicit", "C-knots-only"),
                        ("B-inherited-explicit", "D-tolerance-only")):
        if left in metrics_by_case and right in metrics_by_case:
            ml, mr = metrics_by_case[left], metrics_by_case[right]
            pairwise[f"{left}__vs__{right}"] = {
                key: mr[key] - ml[key]
                for key in ("railTimeErrorS", "maxPositionErrorM", "maxVelocityErrorMps")}

    # ---- Integrity vs reserve status (never aggregated into one green) ----
    any_reserve_failed = any(r.get("metrics", {}).get("anyReserveFailed", False)
                             for r in ledger if r.get("metrics"))
    expected_dispositions = all(r["pass"] for r in ledger)
    avb = comparisons.get("A_vs_B", {})
    comparison_integrity = (
        comparisons.get("A_vs_retained_old", {}).get("changedLeaves", ["missing"]) == []
        and avb.get("changedLeaves") == []
        and avb.get("identityDiffers") is True
        and avb.get("bAppliedEqualsInheritedLiterals") is True
        and avb.get("bPolicyId") == "candidate-native-diagnostic-numerics/1.0.0"
        and all(v.get("match") for v in comparisons.get("C_to_E_effectiveInputs", {}).values())
        and sidecars.get("A-inherited-absent") is not None
        and sidecars.get("B-inherited-explicit") is not None
        and sidecars["A-inherited-absent"]["straddledTrials"] == sidecars["B-inherited-explicit"]["straddledTrials"]
        and sidecars["A-inherited-absent"]["stepWindowTrials"] == sidecars["B-inherited-explicit"]["stepWindowTrials"]
        and sidecars["A-inherited-absent"]["cutKnotsS"] == sidecars["B-inherited-explicit"]["cutKnotsS"]
        and sidecars["A-inherited-absent"]["clippedTrials"] == sidecars["B-inherited-explicit"]["clippedTrials"] == []
    )
    try:
        manufactured = manufactured_crossing_check()
        manufactured_ok = True
    except AssertionError as exc:
        manufactured = {"error": repr(exc)}
        manufactured_ok = False
    reference_controls = {
        "manufacturedCrossing": manufactured,
        "coarseFineWithinReferenceReserves": all(
            r.get("metrics", {}).get("checks", {}).get("referenceRailDeltaS", {}).get("pass", False)
            and r.get("metrics", {}).get("checks", {}).get("referencePositionDeltaM", {}).get("pass", False)
            and r.get("metrics", {}).get("checks", {}).get("referenceVelocityDeltaMps", {}).get("pass", False)
            for r in ledger if r.get("metrics")),
    }
    integrity = expected_dispositions and comparison_integrity and manufactured_ok and all(
        row.get("deltaSetMatch", True) for row in ledger) and reference_controls["coarseFineWithinReferenceReserves"]
    default_failure_reproduced = False
    for row in ledger:
        if row["id"] == "A-inherited-absent" and row.get("metrics"):
            rail = row["metrics"]["checks"]["railTimeErrorS"]
            default_failure_reproduced = not rail["pass"]
            row["metrics"]["retainedDefaultFailureReproduced"] = default_failure_reproduced
    summary = {
        "schema": "rmp12-candidate-controls-result/1.0.0",
        "status": "pass" if integrity else "fail",
        "integrityStatus": "complete" if integrity else "incomplete",
        "reserveStatus": {r["id"]: (r.get("metrics", {}).get("diagnosticPass") if r.get("metrics")
                                    else r.get("observedDisposition", "refusal"))
                          for r in ledger},
        "anyProvisionalReserveFailed": any_reserve_failed,
        "retainedDefaultFailureReproduced": default_failure_reproduced,
        "reserveInterpretation": "provisional software diagnostics only; a passing optional configuration never closes the retained default failure or RMP12-C02",
        "profileAttempts": plan["nativeProfileProcessBudget"], "legacyAttempts": plan["legacyProcessBudget"],
        "totalProcessAttempts": len(ledger), "retries": 0,
        "planSha256": sha(plan_bytes), "checkerSha256": sha(Path(__file__).read_bytes()),
        "sourceSeal": seal["sources"], "toolchain": toolchain,
        "equationBlockIdentity": True,
        "deltaSets": delta_sets, "comparisons": comparisons, "pairwiseEffects": pairwise,
        "referenceControls": reference_controls,
        "comparisonsUnresolved": not (manufactured_ok
            and reference_controls["coarseFineWithinReferenceReserves"] and bool(metrics_by_case)),
        "modelMismatchFloorMps2": plan["modelMismatchFloorMps2"],
        "mechanismEvidence": dict(
            {cid: {"straddled": len(sidecar.get("straddledTrials", [])),
                   "clipped": len(sidecar.get("clippedTrials", [])),
                   "stepWindowTrials": len(sidecar.get("stepWindowTrials", [])),
                   "cutKnots": len(sidecar.get("cutKnotsS", []))}
             for cid, sidecar in sidecars.items()},
            **{row["id"]: {"straddled": "N/A", "clipped": "N/A", "stepWindowTrials": "N/A",
                           "cutKnots": "N/A",
                           "reason": row.get("refusalMessageSha256", row.get("error", "refused"))}
               for row in ledger if row["id"] in NEGATIVE_MESSAGE_KEYS}),
        "cases": ledger,
        "scope": "candidate-only synthetic numerical-controls experiment; no adaptive-convergence/global-error/full-6D/physical/source/empirical/native-WASM/mission qualification or default selection",
    }
    fsync_json(output / "result.json", summary)
    print(json.dumps(summary, indent=2))
    return 0 if summary["status"] == "pass" else 1


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]))
