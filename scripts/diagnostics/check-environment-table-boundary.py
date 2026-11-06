#!/usr/bin/env python3
"""Synthetic native E1a/T1a boundary and interoperability checks, no trajectories.

Usage: checker environment_binary environment_request table_binary table_request
All source tables are synthetic. The joint case explicitly assigns a synthetic
fixed Re to its table; it neither calibrates nor qualifies any measured source.
"""
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

env_binary, env_path, table_binary, table_path = [Path(s).resolve() for s in sys.argv[1:]]
env_request = json.loads(env_path.read_text())
table_request = json.loads(table_path.read_text())
cases = []

def run(label, binary, request, valid=True):
    with tempfile.TemporaryDirectory(prefix="environment-table-check-") as directory:
        path = Path(directory) / "request.json"
        path.write_text(json.dumps(request, allow_nan=False))
        completed = subprocess.run([str(binary), str(path)], text=True, capture_output=True, check=False)
    response = json.loads(completed.stdout)
    expected = "ok" if valid else "error"
    assert expected in response and completed.returncode == (0 if valid else 1), (label, completed.returncode, response)
    cases.append({"case": label, "status": "pass", "error": response.get("error")})
    if valid:
        assert response["ok"]["input"] == request, label
    return response[expected]

def near(a, b):
    assert math.isclose(a, b, rel_tol=3e-12, abs_tol=3e-12), (a, b)

def vec(v):
    return [v[k] for k in "xyz"]

def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]

e = run("environment-geometric-pressure-midpoint", env_binary, env_request)
near(e["sample"]["pressurePa"], 50000.0)
near(e["sample"]["temperatureK"], 250.0)
for k, expected in zip(["east", "north", "up"], [30.0, 40.0, 0.0]):
    near(e["flow"]["airRelativeVelocityEnuMps"][k], expected)
near(e["flow"]["airspeedMps"], 50.0)
near(e["sample"]["densityKgM3"], 50000.0/(287.05287*250.0))
near(e["surfaces"][0]["reynolds"]/e["surfaces"][1]["reynolds"], 8.0)
assert e["empiricalQualification"] == "unqualified"

bad = copy.deepcopy(env_request); bad["query"]["timeUtcUnixS"] = bad["profile"]["validity"]["untilUtcUnixS"]+1
run("expired-profile-refused", env_binary, bad, False)
bad = copy.deepcopy(env_request); bad["profile"]["units"]["temperature"] = "C"
run("implicit-celsius-refused", env_binary, bad, False)
bad = copy.deepcopy(env_request); bad["query"]["altitudeDatum"] = "geopotentialMsl"
run("implicit-altitude-datum-conversion-refused", env_binary, bad, False)

# Independent bilinear evaluation and full dimensional wrench at the CG.
t = run("supplied-table-full-wrench", table_binary, table_request)
q = table_request["query"]; tab = table_request["table"]
u = (q["mach"]-tab["machAxis"][0])/(tab["machAxis"][1]-tab["machAxis"][0])
v = (q["alphaRad"]-tab["alphaRadAxis"][0])/(tab["alphaRadAxis"][1]-tab["alphaRadAxis"][0])
weights = [(0,0,(1-u)*(1-v)),(0,1,(1-u)*v),(1,0,u*(1-v)),(1,1,u*v)]
coeff = {key: [sum(w*tab["nodes"][i][j][key][axis] for i,j,w in weights) for axis in "xyz"] for key in ["cfB", "cmB"]}
pressure = 0.5*q["densityKgM3"]*q["speedMps"]**2
force = [pressure*tab["references"]["areaM2"]*c for c in coeff["cfB"]]
delta = [a-b for a,b in zip(vec(tab["datumPositionFromNoseBM"]), vec(q["cgPositionFromNoseBM"]))]
shift = cross(delta, force)
moment = [pressure*tab["references"]["areaM2"]*tab["references"]["lengthM"]*c+s for c,s in zip(coeff["cmB"],shift)]
for key, expected in [("forceBN",force),("momentBNm",moment)]:
    for a,b in zip(vec(t["staticDimensionalAtCg"][key]),expected): near(a,b)
assert t["totalDynamicLoads"] is None and t["cp"] is None
assert t["empiricalStatus"] == "unqualified-source-not-reviewed"
changed = copy.deepcopy(table_request)
changed["query"]["targetReferences"] = {"areaM2":7.0,"lengthM":0.8,"diameterM":0.3}
changed["query"]["targetDatumPositionFromNoseBM"] = {"x":-0.3,"y":-0.7,"z":0.9}
tr = run("reference-and-skewed-datum-invariance", table_binary, changed)
for key in ["forceBN","momentBNm"]:
    for a,b in zip(vec(t["staticDimensionalAtCg"][key]),vec(tr["staticDimensionalAtCg"][key])): near(a,b)
pure = copy.deepcopy(table_request)
for row in pure["table"]["nodes"]:
    for node in row: node["cfB"] = dict.fromkeys("xyz",0.0)
pure_a = run("pure-couple-with-zero-force", table_binary, pure)
pure["query"]["cgPositionFromNoseBM"] = {"x":0.7,"y":-2.1,"z":-0.3}
pure_b = run("pure-couple-independent-of-cg", table_binary, pure)
assert all(v == 0.0 for v in vec(pure_a["staticDimensionalAtCg"]["forceBN"]))
for a,b in zip(vec(pure_a["staticDimensionalAtCg"]["momentBNm"]),vec(pure_b["staticDimensionalAtCg"]["momentBNm"])): near(a,b)
assert any(v != 0.0 for v in vec(pure_a["staticDimensionalAtCg"]["momentBNm"]))
bad = copy.deepcopy(table_request); del bad["table"]["nodes"][0][0]["cmB"]
run("missing-independent-moment-refused", table_binary, bad, False)
bad = copy.deepcopy(table_request); bad["query"]["fixedConditions"]["powerNozzleCondition"] = "different condition"
run("power-condition-mismatch-refused", table_binary, bad, False)
bad = copy.deepcopy(table_request); bad["query"]["targetReferences"]["areaM2"] = 1e308; bad["table"]["references"]["areaM2"] = 1e-308
run("reference-ratio-underflow-refused", table_binary, bad, False)

# An isothermal/constant-wind synthetic profile keeps Mach and speed fixed while
# pressure changes Re. Supply its actual local state to the synthetic table.
joint = copy.deepcopy(env_request)
first,last = joint["profile"]["knots"][0],joint["profile"]["knots"][-1]
last["temperatureK"] = first["temperatureK"]
last["windTowardEnuMps"] = copy.deepcopy(first["windTowardEnuMps"])
joint["query"]["altitudeM"] = first["altitudeM"]
a = math.sqrt(1.4*287.05287*first["temperatureK"])
wind = first["windTowardEnuMps"]
joint["query"]["groundVelocityEnuMps"] = {"east":wind["east"]+q["mach"]*a,"north":wind["north"],"up":wind["up"]}
low = run("joint-environment-low-altitude", env_binary, joint)
joint["query"]["altitudeM"] = last["altitudeM"]
high = run("joint-environment-high-altitude", env_binary, joint)
near(low["flow"]["mach"], high["flow"]["mach"])
near(low["flow"]["reynoldsPerM"]/high["flow"]["reynoldsPerM"],4.0)
combined = copy.deepcopy(table_request)
combined["table"]["source"]["description"] += "; joint synthetic fixed-Re condition assigned for interface verification only"
reynolds = low["flow"]["reynoldsPerM"]
combined["table"]["fixedConditions"]["reynoldsPerMeter"] = reynolds
for state in [low,high]:
    combined["query"].update({"environmentIdentity":state["environmentIdentity"],"mach":state["flow"]["mach"],"densityKgM3":state["sample"]["densityKgM3"],"speedMps":state["flow"]["airspeedMps"]})
    combined["query"]["fixedConditions"]["reynoldsPerMeter"] = state["flow"]["reynoldsPerM"]
    valid = state is low
    result = run("joint-matched-environment" if valid else "joint-changed-Re-refused-at-same-Mach", table_binary, combined, valid)
    if valid: near(result["dynamicPressurePa"], state["flow"]["dynamicPressurePa"])
print(json.dumps({"status":"pass","caseCount":len(cases),"cases":cases,"scope":"synthetic native JSON/API checks; no trajectories or empirical observations", "jointScope":"angle supplied independently; no attitude/flight integration; source fixed Re assigned only for synthetic interface test"},indent=2))
