#!/usr/bin/env python3
"""RMP12a independent vertical reference; nine frozen native calls, no fitting.

Usage: check-candidate-numerics.py NATIVE_EXAMPLE NEW_OUTPUT_DIRECTORY
The output directory must not exist. This is a synthetic software experiment,
not physical qualification or an adaptive-tolerance/native-WASM study.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

PLAN = "docs/internal/execution-runs/RMP12-native-reference/EXPERIMENT.json"
FROZEN_PLAN_SHA256 = "6d37ff09f7823f3b6d8639ad48a3381fb4fe46ee4cd94bcb267170fddf5e2e52"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rk4(rhs, t, y, h):
    a = rhs(t, y)
    b = rhs(t + h / 2, tuple(v + h * w / 2 for v, w in zip(y, a)))
    c = rhs(t + h / 2, tuple(v + h * w / 2 for v, w in zip(y, b)))
    d = rhs(t + h, tuple(v + h * w for v, w in zip(y, c)))
    return tuple(v + h * (aa + 2 * bb + 2 * cc + dd) / 6
                 for v, aa, bb, cc, dd in zip(y, a, b, c, d))


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


def request_for(base, case):
    request = copy.deepcopy(base)
    request["candidate"]["launch"]["railElevationDeg"] = 90.0
    request["candidate"]["launch"]["timeStepS"] = case["macroStepS"]
    request["candidate"]["horizonSeconds"] = case["horizonS"]
    if case.get("mutation") == "validUntil=launchTime+2":
        s = request["environmentSelection"]
        s["profile"]["validity"]["untilUtcUnixS"] = s["launchTimeUtcUnixS"] + 2
    elif case.get("mutation") == "lastProfileKnotAltitude=100":
        request["environmentSelection"]["profile"]["knots"][-1]["altitudeM"] = 100
    return request


def compare(report, request, plan):
    r = plan["reserves"]
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
    coarse, coarse_rail = ref.integrate(times, plan["reference"]["maxStepsS"][0])
    fine, fine_rail = ref.integrate(times, plan["reference"]["maxStepsS"][1])
    assert fine_rail and coarse_rail
    metrics = {"referencePositionDeltaM": max(abs(coarse[t][0] - fine[t][0]) for t in fine),
               "referenceVelocityDeltaMps": max(abs(coarse[t][1] - fine[t][1]) for t in fine),
               "referenceRailDeltaS": abs(coarse_rail["estimateS"] - fine_rail["estimateS"]),
               "referenceRail": fine_rail, "liftoffReferenceS": ref.liftoff,
               "maxPositionErrorM": 0.0, "maxVelocityErrorMps": 0.0,
               "maxTransversePositionM": 0.0, "maxTransverseVelocityMps": 0.0,
               "maxRateRadps": 0.0, "maxQuaternionChord": 0.0,
               "maxMassErrorKg": 0.0, "committedSamplesCompared": len(samples)}
    q0 = (math.sqrt(.5), math.sqrt(.5), 0, 0)
    states = [(s["timeS"], s["state"]) for s in samples] + [(tr["finalTimeS"], tr["finalState"])]
    for t, s in states:
        z, v = fine[t]
        errors = {"maxPositionErrorM": abs(s["positionM"][2] - z),
                  "maxVelocityErrorMps": abs(s["velocityMps"][2] - v),
                  "maxTransversePositionM": math.hypot(*s["positionM"][:2]),
                  "maxTransverseVelocityMps": math.hypot(*s["velocityMps"][:2]),
                  "maxRateRadps": math.hypot(*s["omegaRadps"]),
                  "maxQuaternionChord": min(math.dist(s["quaternionWxyz"], q0),
                                             math.dist(s["quaternionWxyz"], [-x for x in q0]))}
        for key, value in errors.items():
            metrics[key] = max(metrics[key], value)
    for s in samples:
        metrics["maxMassErrorKg"] = max(metrics["maxMassErrorKg"], abs(s["mechanics"]["massKg"] - ref.mass(s["timeS"])))
    rail = next(e for e in report["events"] if e["name"] == "Launch Rail Departure")
    burn = next(e for e in report["events"] if e["name"] == "Motor Burnout")
    assert len(report["events"]) == 3
    assert burn["timeS"] == request["candidate"]["motor"]["burnTime"]
    metrics["railTimeErrorS"] = abs(rail["timeS"] - fine_rail["estimateS"])
    for e in (rail, burn):
        z, v = fine[e["timeS"]]
        metrics["maxPositionErrorM"] = max(metrics["maxPositionErrorM"], abs(e["altitudeAglM"] - z))
        metrics["maxVelocityErrorMps"] = max(metrics["maxVelocityErrorMps"], abs(e["velocityMps"] - v))
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
    metrics["diagnosticPass"] = all(v["pass"] for v in metrics["checks"].values())
    metrics["finalReference"] = {"zM": fine[tr["finalTimeS"]][0], "vzMps": fine[tr["finalTimeS"]][1]}
    return metrics


def main(binary, output):
    root = Path(__file__).resolve().parents[2]
    plan_bytes = (root / PLAN).read_bytes()
    assert sha(plan_bytes) == FROZEN_PLAN_SHA256, "reviewed experiment changed"
    plan = json.loads(plan_bytes)
    fixture_bytes = (root / plan["fixture"]).read_bytes()
    assert sha(fixture_bytes) == plan["fixtureSha256"], "frozen fixture changed"
    binary = Path(binary).resolve()
    assert sha(binary.read_bytes()) == plan["binarySha256"], "native executable changed"
    assert len(plan["cases"]) == plan["nativeCallBudget"] == 9
    unchanged = subprocess.run(["git", "diff", "--quiet", plan["baseSha"], "--",
                                "crates/astraea-core", "crates/astraea-engine"], cwd=root)
    assert unchanged.returncode == 0, "core/engine changed after experiment freeze"
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    (output / "experiment.json").write_bytes(plan_bytes)
    base = json.loads(fixture_bytes)
    ledger, raw_success = [], {}
    for case in plan["cases"]:
        cid = case["id"]
        request = request_for(base, case)
        raw_input = json.dumps(request, indent=2).encode() + b"\n"
        (output / (cid + ".input.json")).write_bytes(raw_input)
        row = {"id": cid, "expected": case["expected"], "inputSha256": sha(raw_input), "pass": False}
        try:
            p = subprocess.run([str(binary), "-"], input=raw_input, capture_output=True, timeout=30)
            (output / (cid + ".stdout")).write_bytes(p.stdout)
            (output / (cid + ".stderr")).write_bytes(p.stderr)
            row.update(exitCode=p.returncode, stdoutSha256=sha(p.stdout), stderrSha256=sha(p.stderr))
            if case["expected"] == "success":
                assert p.returncode == 0, p.stderr.decode()
                row["metrics"] = compare(json.loads(p.stdout), request, plan)
                row["pass"] = row["metrics"]["diagnosticPass"]
                raw_success[cid] = p.stdout
            elif case["expected"].startswith("byte-identical-to-"):
                original = case["expected"].removeprefix("byte-identical-to-")
                assert p.returncode == 0 and p.stdout == raw_success[original]
                row["pass"] = True
            else:
                message = p.stderr.decode()
                assert p.returncode == 1 and case["expected"] in message
                assert "adaptive-endpoint-stage; speculative=true" in message, message
                time_match = re.search(r"at t=([0-9.eE+-]+) s", message)
                assert time_match
                stage_time = float(time_match.group(1))
                assert 0 < stage_time <= case["horizonS"]
                if cid == "fractional-expiry":
                    assert stage_time > 2
                row.update(pass_=True, failurePhase="adaptive-endpoint-stage", speculative=True,
                           failureStageTimeS=stage_time)
                row["pass"] = row.pop("pass_")
        except subprocess.TimeoutExpired as exc:
            (output / (cid + ".stdout")).write_bytes(exc.stdout or b"")
            (output / (cid + ".stderr")).write_bytes(exc.stderr or b"")
            row["error"] = "native process exceeded30s; subprocess killed/waited, no retry"
        except (AssertionError, ValueError, KeyError, StopIteration, TypeError, IndexError, OverflowError) as exc:
            row["error"] = repr(exc)
        ledger.append(row)
        (output / "attempts.json").write_text(json.dumps(ledger, indent=2) + "\n")
    summary = {"schema": "rmp12-native-reference-result/1.0.0", "status": "pass" if all(r["pass"] for r in ledger) else "fail",
               "nativeAttempts": len(ledger), "nativeCallBudget": plan["nativeCallBudget"],
               "experimentSha256": sha(plan_bytes), "fixtureSha256": sha(fixture_bytes),
               "binarySha256": plan["binarySha256"], "harnessSha256": sha(Path(__file__).read_bytes()),
               "pointwiseNegligibleAeroAccelerationBoundMps2": 1e-6 * plan["reference"]["gMps2"],
               "scope": "provisional synthetic vertical native reference only; no adaptive-tolerance/global-error/physical/native-WASM qualification",
               "cases": ledger}
    (output / "result.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0 if summary["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
