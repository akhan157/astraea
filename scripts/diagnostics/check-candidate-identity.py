#!/usr/bin/env python3
"""RMP07 synthetic candidate identity/preservation check; no scoring datasets.

Five native CLI invocations: native/profile report, one replay each, legacy
preservation. Supply a baseline built from the accepted parent with the same
frozen requests. The baseline must carry the same computed input/model identity;
old pre-identity or pre-knot artifacts do not establish this comparison.
Report schema and command metadata are versioned representation fields; every
other key, including contentIdentity and effectiveInputs, must match the parent.
No build, server, source search or protected outcome access is performed here.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[2]
NATIVE_SCHEMA = "astraea-native-candidate-report/2.0.0"
PROFILE_SCHEMA = "astraea-native-profile-candidate-report/2.0.0"
NATIVE_COMMANDS = {
    "dispatchRegistered": True,
    "commandName": "simulate_candidate",
    "wasmTargetIncluded": True,
    "activation": "explicit request only; not a project field, default flight model, GUI option or ensemble provider",
    "outputPolicy": "all committed macro samples and all requested curve points; no decimation; no response-size cap added",
    "artifactIdentity": "not self-reported; caller binds the executed engine artifact",
}
PROFILE_COMMANDS = {
    "dispatchRegistered": False,
    "note": "Native E1 profile helper only; no dispatch command in this increment.",
}
# Named representation deltas only. Schema, command metadata and the corrected
# exposure scope string changed by the explicit candidate runtime cutover;
# contentIdentity and all physical/input content must still match the
# accepted-parent baseline.
REPRESENTATION_DELTA_KEYS = {"schemaId", "commands", "scopeNote"}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return f"i{value};"
    if isinstance(value, float):
        # Independent Python/struct implementation of the declared bit format.
        bits = struct.pack(">d", 0.0 if value == 0.0 else value).hex()
        return f"f{bits};"
    if isinstance(value, list):
        return "[" + ",".join(map(canonical, value)) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(canonical(k) + ":" + canonical(value[k])
                              for k in sorted(value)) + "}"
    raise TypeError(type(value))


def run(binary, request, output):
    p = subprocess.run([str(binary), str(request)], capture_output=True)
    output.write_bytes(p.stdout)
    output.with_suffix(".stderr").write_bytes(p.stderr)
    assert p.returncode == 0, (binary, p.returncode, p.stderr.decode())
    return json.loads(p.stdout)


def verify(report, schema_id, commands):
    c = report["contentIdentity"]
    expected = c["schemeId"] + "\n" + c["encodingId"] + "\n" + canonical(c["envelope"])
    assert expected == c["canonicalPreimage"]
    assert hashlib.sha256(expected.encode()).hexdigest() == c["sha256"]
    assert c["envelope"]["models"] == report["identities"]
    assert c["envelope"]["activePolicies"] == report["activePolicies"]
    assert c["runtimeIdentity"] is None
    assert report["status"] == "experimental-unqualified"
    assert report["schemaId"] == schema_id, report["schemaId"]
    assert report["commands"] == commands, report["commands"]
    return c["sha256"]


def representable(report):
    return {k: v for k, v in report.items() if k not in REPRESENTATION_DELTA_KEYS}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("examples", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("baseline", type=Path, help="accepted-parent synthetic output directory")
    parser.add_argument("legacy_request", type=Path, help="permitted synthetic legacy request")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    fixtures = ROOT / "crates/astraea-engine/tests/fixtures"
    result = {"status": "pass", "scope": "native input/model identity and unchanged synthetic content except named representation deltas; not numerical or empirical qualification", "cliInvocations": 5, "representationDeltaKeys": sorted(REPRESENTATION_DELTA_KEYS), "artifacts": {}, "cases": {}}
    for name, executable, fixture, baseline, schema_id, commands in [
        ("native", "native_candidate_flight", "native-candidate-request.json", "native-report.json", NATIVE_SCHEMA, NATIVE_COMMANDS),
        ("profile", "profile_candidate_flight", "profile-candidate-request.json", "profile-report.json", PROFILE_SCHEMA, PROFILE_COMMANDS),
    ]:
        output = args.output / f"{name}.json"
        report = run(args.examples / executable, fixtures / fixture, output)
        key = verify(report, schema_id, commands)
        replay = run(args.examples / "replay_candidate_report", output, args.output / f"{name}-replay.json")
        assert verify(replay, schema_id, commands) == key
        baseline_path = args.baseline / baseline
        baseline_report = json.loads(baseline_path.read_text())
        assert baseline_report["contentIdentity"]["sha256"] == key, f"{name}: input/model identity changed"
        assert representable(report) == representable(baseline_report), f"changed {name} content beyond {sorted(REPRESENTATION_DELTA_KEYS)}"
        result["cases"][name] = {"inputModelSha256": key, "independentCanonicalAndDigest": "pass", "serializedReplayIdentity": "pass", "reportSchemaId": schema_id, "commandMetadata": "pass", "contentUnchangedWithNamedRepresentationDeltas": "pass", "baselineSha256": sha(baseline_path)}
        result["artifacts"][executable] = sha(args.examples / executable)
    legacy = args.output / "legacy.json"
    run(args.examples / "legacy_flight_snapshot", args.legacy_request, legacy)
    assert legacy.read_bytes() == (args.baseline / "legacy.json").read_bytes()
    result["cases"]["legacy"] = {"byteIdentical": True, "sha256": sha(legacy)}
    result["artifacts"]["legacy_flight_snapshot"] = sha(args.examples / "legacy_flight_snapshot")
    result["artifacts"]["replay_candidate_report"] = sha(args.examples / "replay_candidate_report")
    result["artifacts"]["checker"] = sha(__file__)
    for path in args.output.iterdir():
        if path.is_file():
            result["artifacts"][path.name] = sha(path)
    (args.output / "metrics.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
