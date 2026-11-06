#!/usr/bin/env python3
"""Regenerate ONLY the Euler columns of the generated telemetry fixture.

Amendment 1 (REVIEW.md): the fixture's presentation columns may be regenerated
only from an independent implementation, never from the Rust/TS code under
test. This script reimplements `attitude-euler/1.0.0` from scratch (the same
closed-form derivation as `derive_attitude.py`), applies the documented
|pitch|=90 gauge, and patches the three Euler tokens of every point row. All
other bytes (fields, vehicle, motor, options, trajectory, quaternions, events)
are preserved verbatim.

Display rule (unchanged from the shipped writers): nonterminal samples are
rounded to 0.1 deg; the terminal touchdown sample is full precision.

Usage:
  python3 regenerate_euler_columns.py PATH [--check]
"""
import hashlib
import json
import math
import re
import sys

FIELDS = ("pitchDeg", "rollDeg", "yawDeg")
LOCK_COS_EPS = 1e-8
ROW_RE = re.compile(r"\[(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?,){25}-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\]")

OLD_PROVENANCE = "npm run fixtures:telemetry (vitest + vite-node over the TS sources, node v24.21.0)"
NEW_PROVENANCE = (
    "trajectory/quaternions: npm run fixtures:telemetry (vitest + vite-node over the "
    "TS sources, node v24.21.0); Euler columns (pitchDeg/rollDeg/yawDeg) regenerated "
    "2026-10-29 by docs/internal/execution-runs/RMP12-attitude-display/"
    "regenerate_euler_columns.py, an independent derivation that does not call the "
    "Rust/TS code under test"
)


def presentation(q):
    """Independent `attitude-euler/1.0.0` implementation.

    R_NB = Rz(yaw) * Rx(pitch) * Ry(roll); pitch = asin(2(wx+yz)),
    roll = atan2(2(wy-zx), 1-2(x^2+y^2)),
    yaw = atan2(2(wz-xy), 1-2(x^2+z^2)).
    At |pitch| = 90 the split is a gauge: roll := 0, pitch := +/-90, yaw
    carries the combined z-rotation (yaw+roll at +90, yaw-roll at -90).
    """
    w, x, y, z = q
    sp = 2.0 * (w * x + y * z)
    sr = 2.0 * (w * y - z * x)
    cos_pair = math.hypot(sr, 1.0 - 2.0 * (x * x + y * y))
    if cos_pair <= LOCK_COS_EPS:
        sign = -1.0 if sp < 0.0 else 1.0
        pitch = math.degrees(sign * (math.pi / 2.0))
        roll = 0.0
        yaw = math.degrees(sign * math.atan2(2.0 * (w * y + z * x), 1.0 - 2.0 * (y * y + z * z)))
        return (pitch, roll, yaw)
    pitch = math.copysign(math.pi / 2.0, sp) if abs(sp) >= 1.0 else math.asin(sp)
    roll = math.atan2(sr, 1.0 - 2.0 * (x * x + y * y))
    yaw = math.atan2(2.0 * (w * z - x * y), 1.0 - 2.0 * (x * x + z * z))
    return (math.degrees(pitch), math.degrees(roll), math.degrees(yaw))


def format_rounded(v):
    s = f"{v:.1f}"
    if s.endswith(".0"):
        s = s[:-2]
    if s in ("-0", "-0.0"):
        s = "0"
    assert "e" not in s and "E" not in s, s
    return s


def format_full(v):
    if v == 0.0:
        return "0"
    s = repr(float(v))
    assert "e" not in s and "E" not in s, f"exponent formatting unsupported: {s}"
    if s.endswith(".0"):
        s = s[:-2]
    return s


def angular_delta(got, old):
    return abs((got - old + 180.0) % 360.0 - 180.0)


def main(path, check):
    text = open(path).read()
    doc = json.loads(text)
    idx = {name: i for i, name in enumerate(doc["fields"])}
    assert [doc["fields"][idx[k]] for k in FIELDS] == list(FIELDS)
    for name, position in (("time", 0), ("q.w", 14), ("q.x", 15), ("q.y", 16),
                           ("q.z", 17), ("altitude", 18), ("pitchDeg", 19),
                           ("rollDeg", 20), ("yawDeg", 21)):
        assert idx[name] == position, (name, idx[name])

    # Expected rows in document order (cases -> points).
    expected_rows = []
    for case in doc["cases"]:
        for i, row in enumerate(case["points"]):
            expected_rows.append((case["case"], i, len(case["points"]), row))
    matches = list(ROW_RE.finditer(text))
    assert len(matches) == len(expected_rows), (len(matches), len(expected_rows))

    report = {"fixture": path, "lockCosEps": LOCK_COS_EPS, "cases": {}}
    changes = {}
    replacements = []
    for match, (name, i, count, row) in zip(matches, expected_rows):
        token_text = match.group(0)
        tokens = token_text[1:-1].split(",")
        assert len(tokens) == 26, (len(tokens), name, i)
        parsed = json.loads(token_text)
        assert parsed == row, f"row parse mismatch at {name}[{i}]"
        q = (row[idx["q.w"]], row[idx["q.x"]], row[idx["q.y"]], row[idx["q.z"]])
        values = presentation(q)
        terminal = i == count - 1
        case = report["cases"].setdefault(name, {
            "rows": count, "terminalRow": count - 1, "lockRows": 0,
            "changed": {k: 0 for k in FIELDS},
            "nonterminalChanged": {k: 0 for k in FIELDS},
            "terminalChanged": {k: 0 for k in FIELDS},
            "maxDeltaDeg": {k: 0.0 for k in FIELDS},
        })
        w, x, y, z = q
        if math.hypot(2.0 * (w * y - z * x), 1.0 - 2.0 * (x * x + y * y)) <= LOCK_COS_EPS:
            case["lockRows"] += 1
        for k, field in enumerate(FIELDS):
            old = row[idx[field]]
            new = values[k]
            if not terminal:
                # The corrected value must not sit on a 0.05 rounding boundary.
                units = new * 10.0
                assert abs(units - (math.floor(units) + 0.5)) > 1e-9, (name, i, field, new)
                stored = round(new, 1)
                token = format_rounded(stored)
                delta = angular_delta(stored, old)
                if delta > 1e-9:
                    case["changed"][field] += 1
                    case["nonterminalChanged"][field] += 1
                case["maxDeltaDeg"][field] = max(case["maxDeltaDeg"][field], delta)
            else:
                token = format_full(new)
                delta = angular_delta(new, old)
                if delta > 1e-9:
                    case["changed"][field] += 1
                    case["terminalChanged"][field] += 1
                case["maxDeltaDeg"][field] = max(case["maxDeltaDeg"][field], delta)
            assert abs(json.loads(token) - new) <= (0.05 + 1e-9), (token, new)
            tokens[idx[field]] = token
        replacements.append((match.start(), match.end(), "[" + ",".join(tokens) + "]"))

    new_text = []
    cursor = 0
    for start, end, replacement in replacements:
        new_text.append(text[cursor:start])
        new_text.append(replacement)
        cursor = end
    new_text.append(text[cursor:])
    new_text = "".join(new_text)
    assert NEW_PROVENANCE not in new_text
    assert new_text.count(OLD_PROVENANCE) == 1
    new_text = new_text.replace(OLD_PROVENANCE, NEW_PROVENANCE)

    # Verify the patch: only the Euler fields changed, and they match the
    # independent implementation at the stored precision.
    patched = json.loads(new_text)
    assert patched["fields"] == doc["fields"]
    assert patched["source"] == doc["source"]
    assert patched["vehicle"] == doc["vehicle"]
    assert patched["motor"] == doc["motor"]
    assert patched["generatedOn"] == doc["generatedOn"]
    for old_case, new_case in zip(doc["cases"], patched["cases"]):
        assert old_case["case"] == new_case["case"]
        for key in old_case:
            if key == "points":
                continue
            assert old_case[key] == new_case[key], key
        assert len(old_case["points"]) == len(new_case["points"])
        for i, (old_row, new_row) in enumerate(zip(old_case["points"], new_case["points"])):
            assert len(old_row) == len(new_row)
            for j, (a, b) in enumerate(zip(old_row, new_row)):
                if doc["fields"][j] in FIELDS:
                    continue
                assert a == b, (old_case["case"], i, doc["fields"][j])
            q = (new_row[idx["q.w"]], new_row[idx["q.x"]], new_row[idx["q.y"]], new_row[idx["q.z"]])
            expect = presentation(q)
            for k, field in enumerate(FIELDS):
                got = new_row[idx[field]]
                want = expect[k]
                tol = 0.05 + 1e-9 if i < len(old_case["points"]) - 1 else 1e-9
                assert abs(got - want) <= tol, (old_case["case"], i, field, got, want)

    report["oldSha256"] = hashlib.sha256(text.encode()).hexdigest()
    report["newSha256"] = hashlib.sha256(new_text.encode()).hexdigest()
    report["bytes"] = {"old": len(text.encode()), "new": len(new_text.encode())}
    if check:
        print(json.dumps(report, indent=2))
        return
    with open(path, "w") as fh:
        fh.write(new_text)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    target = sys.argv[1]
    main(target, "--check" in sys.argv)
