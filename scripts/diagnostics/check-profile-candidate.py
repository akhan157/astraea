#!/usr/bin/env python3
"""Independent native bridge arithmetic on committed synthetic inputs only.
Usage: check-profile-candidate.py EXAMPLE FIXTURE
"""
import copy
import json
import math
from pathlib import Path
import subprocess
import sys

binary, fixture = sys.argv[1:]
base = json.loads(Path(fixture).read_text())
checks = []


def call(request, error=None):
    p = subprocess.run([binary, "-"], input=json.dumps(request), text=True, capture_output=True, timeout=30)
    if error:
        assert p.returncode == 1 and error in p.stderr, (p.returncode, p.stderr)
        return
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout)


def near(a, b):
    assert math.isclose(a, b, rel_tol=3e-12, abs_tol=1e-13), (a, b)


r = call(base)
assert r["effectiveInputs"] == base
assert r["schemaId"] == "astraea-native-profile-candidate-report/2.0.0"
assert r["commands"] == {"dispatchRegistered": False, "note": "Native E1 profile helper only; no dispatch command in this increment."}
assert r["equivalence"]["profileObservationQueryExact"] is True
points = r["trajectory"]["samples"]
launch = base["environmentSelection"]["launchTimeUtcUnixS"]
knots = base["environmentSelection"]["profile"]["knots"]
for s in points:
    o = s["profileEnvironment"]
    altitude = 100 + s["state"]["positionM"][2]
    f = altitude / 1000
    pressure = math.exp((1-f)*math.log(knots[0]["pressurePa"]) + f*math.log(knots[1]["pressurePa"]))
    density = pressure / (287.05287*300)
    sound = math.sqrt(1.4*287.05287*300)
    mu = 1.458e-6*300**1.5/(300+110.4)
    speed = math.hypot(*s["state"]["velocityMps"])
    near(o["altitudeGeometricMslM"], altitude)
    near(o["pressurePa"], pressure)
    near(o["dynamicViscosityPaS"], mu)
    near(o["mach"], speed/sound)
    near(o["densityKgM3"], density)
    near(o["reynoldsPerM"], density*speed/mu)
    near(o["dynamicPressurePa"], .5*density*speed*speed)
    assert o["sampledFloorEpochS"] == launch + math.floor(s["timeS"])
    near(o["fractionalSecond"], s["timeS"] % 1)
    if s["coefficients"]["datum"] is not None:
        near(s["staticForceBodyN"][1], -.5*density*speed*speed*r["geometry"]["areaM2"]*base["candidate"]["axial"]["ca0"])
checks.append("all 201 committed states independently match supplied P/T/wind, q/M/mu/Re and axial force")
q = r["query"]["sample"]
assert q["profileEnvironment"] == points[-1]["profileEnvironment"]
assert q["staticForceBodyN"] == points[-1]["staticForceBodyN"]
reference = r["equivalence"]["referenceMach"]
c = next(p for p in r["curves"]["points"] if p["mach"] == reference)
for a, b in zip(c["staticForceBodyN"], q["staticForceBodyN"]):
    near(a, b)
checks.append("trajectory/query/curve dimensional and environment equality")
x = copy.deepcopy(base)
for k in x["environmentSelection"]["profile"]["knots"]:
    k["pressurePa"] *= .5
b = call(x)
assert b["trajectory"]["finalState"] != r["trajectory"]["finalState"]
checks.append("changed same-label profile changes real trajectory; no stale cache")
for path, replacement, message in [
    (["environmentSelection", "verticalDatumIdentity"], "wrong", "datum"),
    (["candidate", "environment", "windSpeedSurfaceMps"], 2, "wind"),
    (["candidate", "environmentSourceId"], "wrong", "source identity"),
    (["environmentSelection", "profile", "units", "pressure"], "hPa", "unknown variant"),
    (["environmentSelection", "profile", "knots"], [], "two altitude knots"),
]:
    x = copy.deepcopy(base)
    target = x
    for k in path[:-1]:
        target = target[k]
    target[path[-1]] = replacement
    call(x, message)
    checks.append("refuses "+"/".join(path))
x = copy.deepcopy(base)
x["environmentSelection"]["profile"]["validity"]["untilUtcUnixS"] = launch+2
assert call(x)["trajectory"]["finalTimeS"] == 2
x["candidate"]["horizonSeconds"] = 2.0000000001
call(x, "fractional stage time")
checks.append("inclusive stop and fractional expiration refusal")
print(json.dumps({"status": "pass", "count": len(checks), "checks": checks,
                  "scope": "synthetic native prescribed-CA0 profile bridge; no measured accuracy or local axial integration"}, indent=2))
