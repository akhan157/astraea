#!/usr/bin/env python3
"""Synthetic checks through the actual native E1b command, not flight validation.
Usage: checker native_friction_binary synthetic_request.json
"""
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

binary, fixture = [Path(s).resolve() for s in sys.argv[1:]]
request = json.loads(fixture.read_text())
cases = []

def run(label, data, valid=True):
    with tempfile.TemporaryDirectory(prefix="local-friction-check-") as directory:
        source = Path(directory)/"request.json"
        source.write_text(json.dumps(data,allow_nan=False))
        result = subprocess.run([str(binary),str(source)],capture_output=True,text=True,check=False)
    reply = json.loads(result.stdout)
    assert result.returncode == (0 if valid else 1) and ("ok" if valid else "error") in reply, (label,result.returncode,reply)
    cases.append({"case":label,"status":"pass","error":reply.get("error")})
    if valid:
        assert reply["ok"]["input"] == data
        assert reply["ok"]["empiricalQualification"] == "unqualified"
    return reply["ok" if valid else "error"]

def near(a,b):
    assert math.isclose(a,b,rel_tol=3e-12,abs_tol=1e-14),(a,b)

out = run("actual-local-environment-friction",request)
flow = out["environment"]["flow"]
rho = out["environment"]["sample"]["densityKgM3"]
mu = out["environment"]["sample"]["dynamicViscosityPaS"]
re_per_m = rho*flow["airspeedMps"]/mu
mach_term = 0.2*flow["mach"]**2
parameter = math.sqrt(mach_term/(1+0.89*mach_term))
correction = (math.asin(parameter)/parameter)**2 if parameter > 0.001 else 1.0
cd_sum = 0.0
for surface,source in zip(out["surfaces"],request["geometry"]["surfaces"]):
    reynolds = re_per_m*source["lengthM"]
    cutoff = None if source["roughnessM"] == 0 else 51.0*(source["roughnessM"]/source["lengthM"])**(-1.039)
    effective = reynolds if cutoff is None else min(reynolds,cutoff)
    cf = 0.455/(math.log10(effective)**2.58)/correction
    cd = cf*source["formFactor"]*source["wettedAreaM2"]/request["geometry"]["referenceAreaM2"]
    near(surface["reynolds"],reynolds);near(surface["effectiveReynolds"],effective)
    near(surface["cf"],cf);near(surface["cdFriction"],cd)
    cd_sum += cd
near(out["cdFriction"],cd_sum)
near(out["modeledStaticResistanceN"],flow["dynamicPressurePa"]*request["geometry"]["referenceAreaM2"]*cd_sum)

changed = copy.deepcopy(request)
changed["geometry"]["referenceAreaM2"] *= 3
rescaled = run("normalization-preserves-dimensional-resistance",changed)
near(out["cdFriction"],3*rescaled["cdFriction"])
near(out["modeledStaticResistanceN"],rescaled["modeledStaticResistanceN"])

zero = copy.deepcopy(request)
zero["environment"]["query"]["groundVelocityEnuMps"] = out["environment"]["sample"]["windTowardEnuMps"]
z = run("zero-speed-unavailable-cf-zero-static-resistance",zero)
assert z["cdFriction"] is None and z["modeledStaticResistanceN"] == 0
assert z["coefficientUnavailableReason"]
for s in z["surfaces"]: assert s["cf"] is None and s["cdFriction"] is None

low = copy.deepcopy(zero)
low["environment"]["query"]["groundVelocityEnuMps"]["east"] += 0.001
assert "no floor" in run("low-Re-rejected-without-floor",low,False)
bad = copy.deepcopy(request);bad["geometry"]["surfaces"][0]["roughnessM"] *= 2
run("surface-roughness-mismatch-refused",bad,False)
bad = copy.deepcopy(request);bad["source"]["geometryIdentity"] = "other"
run("source-geometry-mismatch-refused",bad,False)
bad = copy.deepcopy(request);bad["geometry"]["surfaces"][0]["formfactor"] = 1
run("misspelled-form-factor-refused",bad,False)
bad = copy.deepcopy(request);bad["environment"]["query"]["timeUtcUnixS"] = 0
run("environment-time-guard-preserved",bad,False)

# Smooth, isothermal, constant-wind synthetic source: same Mach/speed, different
# pressure produces different Cf through local Re, independently of q scaling.
isothermal = copy.deepcopy(request)
knots = isothermal["environment"]["profile"]["knots"]
knots[-1]["temperatureK"] = knots[0]["temperatureK"]
knots[-1]["windTowardEnuMps"] = copy.deepcopy(knots[0]["windTowardEnuMps"])
for collection in [isothermal["geometry"]["surfaces"],isothermal["environment"]["surfaces"]]:
    for surface in collection: surface["roughnessM"] = 0.0
isothermal["environment"]["query"]["altitudeM"] = knots[0]["altitudeM"]
a = run("same-Mach-low-altitude-local-Re",isothermal)
isothermal["environment"]["query"]["altitudeM"] = knots[-1]["altitudeM"]
b = run("same-Mach-high-altitude-local-Re",isothermal)
near(a["environment"]["flow"]["mach"],b["environment"]["flow"]["mach"])
near(a["environment"]["flow"]["airspeedMps"],b["environment"]["flow"]["airspeedMps"])
near(a["environment"]["flow"]["reynoldsPerM"]/b["environment"]["flow"]["reynoldsPerM"],4.0)
assert a["cdFriction"] < b["cdFriction"]
assert all(s["roughnessReynoldsCutoff"] is None for s in a["surfaces"])
print(json.dumps({"status":"pass","caseCount":len(cases),"cases":cases,"scope":"synthetic inherited-law/local-state/API checks only; no pressure/base/wave/total-drag or flight accuracy qualification"},indent=2))
