#!/usr/bin/env python3
"""Independent arithmetic/native-boundary probe on explicit synthetic inputs only.

Usage: check-total-axial-boundary.py EXAMPLE FIXTURE
No empirical datasets, telemetry generation, outcome readers or network calls.
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
    proc = subprocess.run([binary, "-"], input=json.dumps(request), text=True,
                          capture_output=True, check=False, timeout=20)
    reply = json.loads(proc.stdout)
    if error is not None:
        assert proc.returncode == 1 and error in reply["error"], reply
        return reply
    assert proc.returncode == 0 and "ok" in reply, reply
    return reply["ok"]


def close(actual, expected):
    assert math.isclose(actual, expected, rel_tol=3e-12, abs_tol=1e-14), (actual, expected)


def verify(request):
    out = call(request)
    e = request["environment"]
    # This portable fixture has two altitude knots; compute interpolation and
    # closure independently rather than trusting the response's E1 results.
    k0, k1 = e["profile"]["knots"]
    f = (e["query"]["altitudeM"] - k0["altitudeM"]) / (k1["altitudeM"] - k0["altitudeM"])
    pressure = math.exp((1-f)*math.log(k0["pressurePa"]) + f*math.log(k1["pressurePa"]))
    temperature = (1-f)*k0["temperatureK"] + f*k1["temperatureK"]
    wind = {c: (1-f)*k0["windTowardEnuMps"][c] + f*k1["windTowardEnuMps"][c] for c in ["east", "north", "up"]}
    air = {c: e["query"]["groundVelocityEnuMps"][c]-wind[c] for c in wind}
    v = math.hypot(air["east"], air["north"], air["up"])
    rho = pressure / (287.05287*temperature)
    mu = 1.458e-6*temperature**1.5/(temperature+110.4)
    mach = v/math.sqrt(1.4*287.05287*temperature)
    q = 0.5*rho*v*v
    close(out["environment"]["flow"]["mach"], mach)
    close(out["environment"]["flow"]["reynoldsPerM"], rho*v/mu)
    assert out["input"] == request and out["environment"]["input"] == e
    assert out["empiricalQualification"] == "unqualified"
    g = request["geometry"]
    sref = g["referenceAreaM2"]
    if v == 0:
        assert out["totalCa0"] is None and out["unavailableReason"]
        assert out["axialForceBodyN"] == [0, 0, 0]
        assert all(c["ca0"] is None and c["axialResistanceN"] == 0 for c in out["components"])
        return out
    expected = {}
    for s in [g["bodyFriction"]] + [f["friction"] for f in g["fins"]]:
        re = (rho*v/mu)*s["lengthM"]
        if s["roughnessM"] > 0:
            re = min(re, 51*(s["roughnessM"]/s["lengthM"])**(-1.039))
        mterm = 0.2*mach*mach
        mparam = math.sqrt(mterm/(1+0.89*mterm))
        fc = (math.asin(mparam)/mparam)**2 if mparam > .001 else 1
        cf = .455/math.log10(re)**2.58/fc
        expected["friction:"+s["identity"]] = cf*s["formFactor"]*s["wettedAreaM2"]/sref
    area_ratio = math.pi/4*g["bodyDiameterM"]**2/sref
    expected["nose-pressure-offset"] = .005*area_ratio
    expected["body-base"] = (.12+.13*mach**2)*area_ratio*(.38 if request["power"] == "powered" else 1)
    for fin in g["fins"]:
        name = fin["friction"]["identity"]
        ratio = fin["spanM"]*fin["thicknessM"]*fin["count"]/sref
        cos2 = fin["spanM"]**2/(fin["spanM"]**2+fin["sweepLengthM"]**2)
        xs = fin["crossSection"]
        le = (.85*(1+mach**2/4+mach**4/40) if xs == "square" else
              ((1-mach**2)**(-.417)-1) if xs in ["rounded", "airfoil"] else 0)
        te = (.12+.13*mach**2)*(1 if xs == "square" else .5 if xs == "rounded" else 0)
        expected["fin-wave:"+name] = 0
        expected["fin-leading-edge:"+name] = le*cos2*ratio
        expected["fin-trailing-edge:"+name] = te*ratio
    actual = {c["identity"]: c for c in out["components"]}
    assert actual.keys() == expected.keys()
    for key, coefficient in expected.items():
        if coefficient > 0:
            assert actual[key]["ca0"] > 0, ("lost positive coefficient", key)
        close(actual[key]["ca0"], coefficient)
        close(actual[key]["axialResistanceN"], q*sref*coefficient)
    close(out["totalCa0"], sum(expected.values()))
    for a, b in zip(out["axialForceBodyN"], [0, -q*sref*sum(expected.values()), 0]):
        close(a, b)
    return out


out = verify(base)
checks.append("independent component/closure/normalization/force sum")
for cross in ["square", "rounded", "airfoil", "doubleWedge"]:
    x = copy.deepcopy(base)
    x["geometry"]["fins"][0]["crossSection"] = cross
    verify(x)
    checks.append("cross-section-"+cross)
x = copy.deepcopy(base)
x["power"] = "powered"
verify(x)
checks.append("powered base factor only")
x = copy.deepcopy(base)
x["geometry"]["referenceAreaM2"] *= 4
changed = verify(x)
close(out["totalCa0"], 4*changed["totalCa0"])
for a, b in zip(out["axialForceBodyN"], changed["axialForceBodyN"]):
    close(a, b)
checks.append("nose+base+friction+edge Sref invariance")
x = copy.deepcopy(base)
fin = copy.deepcopy(x["geometry"]["fins"][0])
fin["friction"]["identity"] = "second-fin"
x["geometry"]["fins"].append(fin)
surface = copy.deepcopy(x["environment"]["surfaces"][1])
surface["identity"] = "second-fin"
x["environment"]["surfaces"].append(surface)
verify(x)
checks.append("every fin set counted once")
x = copy.deepcopy(base)
x["environment"]["query"]["groundVelocityEnuMps"] = {"east": 4, "north": 2, "up": -1}
verify(x)
checks.append("zero-speed coefficients null and forces zero")
x["environment"]["query"]["groundVelocityEnuMps"]["east"] += 1e-6
call(x, "no floor")
checks.append("nonzero low Re refuses")
x = copy.deepcopy(base)
x["powerPolicy"] = "coast-only"
x["power"] = "powered"
call(x, "no coast fallback")
checks.append("power coverage refuses")
for field, value, error in [("units", {"altitude": "m", "pressure": "hPa", "temperature": "K", "wind": "m/s", "time": "UTC Unix seconds"}, "unknown variant"),
                            ("extrapolationPolicy", "clamp", "unknown variant")]:
    x = copy.deepcopy(base)
    x["environment"]["profile"][field] = value
    call(x, error)
    checks.append("strict profile "+field)
x = copy.deepcopy(base)
x["environment"]["query"]["timeUtcUnixS"] = 0
call(x, "outside profile validity")
checks.append("expired profile refuses")
x = copy.deepcopy(base)
x["environment"]["query"]["altitudeM"] = -1
call(x, "outside tabulated coverage")
checks.append("MSL coverage refuses")
x = copy.deepcopy(base)
x["environment"]["query"]["groundVelocityEnuMps"]["east"] = 1000
call(x, "0<=Mach<.8")
checks.append("Mach support refuses")
x = copy.deepcopy(base)
x["geometry"]["bodyFriction"]["typo"] = 1
call(x, "unknown field")
checks.append("unknown nested field refuses")
x = copy.deepcopy(base)
fin = x["geometry"]["fins"][0]
fin["spanM"], fin["sweepLengthM"], fin["thicknessM"] = 1e-100, 1e100, 1e100
call(x, "sweep quotient underflow")
checks.append("positive sweep quotient underflow refuses")
for cross in ["rounded", "airfoil", "square", "doubleWedge"]:
    x = copy.deepcopy(base)
    x["geometry"]["fins"][0]["crossSection"] = cross
    for knot in x["environment"]["profile"]["knots"]:
        knot["pressurePa"] = 1e17
        knot["temperatureK"] = 300
    x["environment"]["query"]["groundVelocityEnuMps"] = {"east": 4.000001, "north": 2, "up": -1}
    if cross in ["rounded", "airfoil"]:
        call(x, "lost positive leading-edge")
    else:
        r = verify(x)
        c = {v["identity"]: v for v in r["components"]}
        assert c["fin-wave:synthetic-fin"]["ca0"] == 0
        if cross == "square":
            assert c["fin-leading-edge:synthetic-fin"]["ca0"] > 0
        else:
            assert c["fin-leading-edge:synthetic-fin"]["ca0"] == 0
            assert c["fin-trailing-edge:synthetic-fin"]["ca0"] == 0
    checks.append("low Mach positive vs structural zero: "+cross)
print(json.dumps({"status": "pass", "scope": "synthetic native direct-axial arithmetic/boundary only, not trajectory or physical qualification", "checks": checks, "count": len(checks)}, indent=2))
