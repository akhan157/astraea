#!/usr/bin/env python3
"""Independent synthetic checks of the actual native JSON diagnostic command.

Arguments: compiled sb1_diagnostic example, request fixture. No flight simulation,
observations, or empirical qualification. Uses explicit vector cross products to
check datum invariance of the returned dimensional wrench.
"""
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

binary, fixture = map(lambda s: Path(s).resolve(), sys.argv[1:])
request = json.loads(fixture.read_text())
cases = []

def run(label, data, valid=True):
    with tempfile.TemporaryDirectory(prefix="sb1-boundary-") as folder:
        source = Path(folder) / "request.json"
        source.write_text(json.dumps(data, allow_nan=False))
        result = subprocess.run([str(binary), str(source)], text=True, capture_output=True, check=False)
    reply = json.loads(result.stdout)
    if valid:
        assert result.returncode == 0 and "ok" in reply, (label, result.returncode, reply)
        output = reply["ok"]
        assert output["input"] == data, label
        assert output["rateLoadsAtCg"] is None and output["totalDynamicLoadsAtCg"] is None, label
        assert output["empiricalQualificationByQuantity"]["staticMoment"] == "unqualified", label
    else:
        assert result.returncode == 1 and "error" in reply, (label, result.returncode, reply)
        output = reply
    cases.append({"case": label, "status": "pass", "error": reply.get("error")})
    return output

def vec(value):
    return [value[k] for k in "xyz"]

def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

def near(a, b):
    assert math.isclose(a, b, rel_tol=2e-12, abs_tol=2e-12), (a, b)

base = copy.deepcopy(request)
base["state"]["relativeVelocityAtCgBMps"] = {"x": -2.0, "y": 100.0, "z": 3.0}
base["state"]["omegaBRadps"] = {"x": 0.2, "y": -0.3, "z": 0.4}
base["state"]["cgPositionFromNoseBM"] = {"x": 0.03, "y": -1.0, "z": -0.02}
base["datumPositionFromNoseBM"] = {"x": 0.07, "y": -0.4, "z": -0.09}
out = run("mixed-incidence-skewed-datum-and-cg", base)
cf = vec(out["staticCoefficientsAtDatum"]["cfB"])
cm = vec(out["staticCoefficientsAtDatum"]["cmB"])
delta = [a-b for a, b in zip(vec(base["datumPositionFromNoseBM"]), vec(base["state"]["cgPositionFromNoseBM"]))]
shift = cross(delta, cf)
refs = out["references"]
q = out["flow"]["dynamicPressurePa"]
for i in range(3):
    near(vec(out["staticLoadsAtCg"]["forceBN"])[i], q*refs["areaM2"]*cf[i])
    near(vec(out["staticLoadsAtCg"]["momentBNm"])[i], q*refs["areaM2"]*(refs["lengthM"]*cm[i]+shift[i]))
changed = copy.deepcopy(base)
changed["datumPositionFromNoseBM"] = {"x": -0.11, "y": -1.2, "z": 0.08}
out2 = run("same-loads-at-different-full-datum", changed)
for quantity in ["forceBN", "momentBNm"]:
    for a, b in zip(vec(out["staticLoadsAtCg"][quantity]), vec(out2["staticLoadsAtCg"][quantity])):
        near(a, b)

zero = copy.deepcopy(base)
zero["state"]["relativeVelocityAtCgBMps"] = dict.fromkeys("xyz", 0.0)
z = run("zero-speed-with-nonzero-rates", zero)
for key in ["angles", "windBasisBW", "reducedRatesB"]:
    assert z["flow"][key] is None, key
assert z["staticCoefficientsAtDatum"] is None
assert z["flow"]["unavailableReason"]
assert all(x == 0.0 for k in ["forceBN", "momentBNm"] for x in vec(z["staticLoadsAtCg"][k]))

cp = copy.deepcopy(base)
c = out["normalDerivativesAtZeroIncidence"]["cPerRad"]
cp["cpPolicy"]["denominatorUncertainty"] = {"kind": "interval", "lower": min(-1.0, c-1), "upper": max(1.0, c+1), "evidenceIdentity": "synthetic-interval-only"}
co = run("denominator-interval-crosses-zero", cp)
assert co["cp"]["stationFromNoseM"] is None
assert co["cp"]["unavailableReason"] == "uncertaintyContainsZero"
assert co["staticLoadsAtCg"] == out["staticLoadsAtCg"]

bad = copy.deepcopy(base); bad["vehicle"]["components"][0]["unmodeledLipM"] = 0.001
run("unknown-physical-field-refused", bad, False)
bad = copy.deepcopy(base); del bad["adapterOptions"]["declarations"]["sharpPhysicalTip"]
run("missing-declaration-refused", bad, False)
bad = copy.deepcopy(base); bad["state"]["mach"] = 0.8
run("mach-upper-bound-refused", bad, False)
bad = copy.deepcopy(base); bad["state"]["relativeVelocityAtCgBMps"] = {"x":0.0,"y":-100.0,"z":0.0}
run("tail-first-refused", bad, False)
bad = copy.deepcopy(base); bad["state"]["relativeVelocityAtCgBMps"] = {"x":0.0,"y":100.0,"z":20.0}
run("excess-incidence-refused", bad, False)
bad = copy.deepcopy(base); bad["state"]["environmentIdentity"] = " "
run("missing-environment-identity-refused", bad, False)
bad = copy.deepcopy(base); bad["cpPolicy"]["policyId"] = "unrecognized"
run("unknown-cp-policy-refused", bad, False)
print(json.dumps({"status": "pass", "caseCount": len(cases), "cases": cases,
    "scope": "native synthetic JSON/API verification; no trajectories or empirical observations"}, indent=2))
