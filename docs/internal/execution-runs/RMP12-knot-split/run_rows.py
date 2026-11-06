#!/usr/bin/env python3
"""RMP12-knot-split bounded diagnostic rows: one execution, no retries.

Runs the four named rows (A20/A10/A5/C20) plus the F20 split-off falsifier on
the new profile example, and the recorded old profile example (SHA bf18b6...)
on the unchanged A20 request for the 105.014 us bit-for-bit falsifier.

The reference is the retained RMP12b independent vertical reference, loaded by
exact path from the existing checker. No physics code is added here. Raw
outputs live outside Git; this script writes only the requested external run
directory and prints a JSON summary.

Usage: run_rows.py NEW_PROFILE_BINARY OLD_PROFILE_BINARY OUTPUT_DIR
"""
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[4]
OLD_RUN = ROOT.parent / "evidence-rmp12c-regime-expansion/run-1"
CHECKER = ROOT / "scripts/diagnostics/check-candidate-controls.py"
PLAN = ROOT / "docs/internal/execution-runs/RMP12-candidate-controls/EXPERIMENT.json"
SIDECAR_PREFIX = "MECHANISM_SIDECAR_JSON:"
OLD_A20_STDOUT_SHA256 = "ced63cf42a93ca4a8019f484caacf3e37eb00b1bfc2a4425d061b978baddf98c"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, indent=2, allow_nan=False) + "\n").encode()


def load_checker():
    spec = importlib.util.spec_from_file_location("rmp12_knot_checker", CHECKER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sidecar_of(stderr):
    for line in stderr.decode(errors="replace").splitlines():
        if line.startswith(SIDECAR_PREFIX):
            return json.loads(line[len(SIDECAR_PREFIX):])
    return None


def invoke(binary, raw, timeout=30):
    started = time.perf_counter()
    proc = subprocess.run([str(binary), "-"], input=raw, capture_output=True, timeout=timeout)
    return proc, time.perf_counter() - started


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    new_binary, old_binary, output_dir = map(pathlib.Path, sys.argv[1:])
    output = output_dir
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"output directory is not fresh: {output}")
    output.mkdir(parents=True, exist_ok=True)
    cc = load_checker()
    plan = json.loads(PLAN.read_text())

    a20_input = (OLD_RUN / "A-dt020.input.json").read_bytes()
    a20_request = json.loads(a20_input)
    f20_request = json.loads(a20_input)
    f20_request["candidate"]["diagnosticNumerics"] = {
        "schemaId": "candidate-native-diagnostic-controls/1.0.0",
        "absoluteTolerancePolicy": "inherited",
        "splitAtThrustKnots": False,
    }
    f20_input = encode(f20_request)
    inputs = {
        "A-dt020": (OLD_RUN / "A-dt020.input.json").read_bytes(),
        "A-dt010": (OLD_RUN / "A-dt010.input.json").read_bytes(),
        "A-dt005": (OLD_RUN / "A-dt005.input.json").read_bytes(),
        "C-dt020": (OLD_RUN / "C-dt020.input.json").read_bytes(),
        "F-dt020": f20_input,
        "OLD-A-dt020": a20_input,
    }
    requests = {k: json.loads(v) for k, v in inputs.items()}
    binaries = {
        "A-dt020": new_binary, "A-dt010": new_binary, "A-dt005": new_binary,
        "C-dt020": new_binary, "F-dt020": new_binary, "OLD-A-dt020": old_binary,
    }

    rows = {}
    for case in ("A-dt020", "A-dt010", "A-dt005", "C-dt020", "F-dt020", "OLD-A-dt020"):
        raw = inputs[case]
        (output / f"{case}.input.json").write_bytes(raw)
        proc, wall = invoke(binaries[case], raw)
        (output / f"{case}.stdout").write_bytes(proc.stdout)
        (output / f"{case}.stderr").write_bytes(proc.stderr)
        if proc.returncode != 0:
            raise SystemExit(f"{case}: exit {proc.returncode}: {proc.stderr[-2000:]!r}")
        report = json.loads(proc.stdout)
        sidecar = sidecar_of(proc.stderr)
        metrics = cc.compare_case(report, requests[case], plan)
        ev = next(e for e in report["events"] if e["name"] == "Launch Rail Departure")
        ref = metrics["referenceRail"]["estimateS"]
        # De-biased along-rail displacement at the REFERENCE rail event time.
        ds = ev["altitudeAglM"] + ev["velocityMps"] * (ref - ev["timeS"]) - 3.0
        rows[case] = {
            "inputSha256": sha(raw),
            "stdoutSha256": sha(proc.stdout),
            "stderrSha256": sha(proc.stderr),
            "exitCode": proc.returncode,
            "wallSeconds": wall,
            "binarySha256": sha(binaries[case].read_bytes()),
            "railEventTimeS": ev["timeS"],
            "referenceRailTimeS": ref,
            "railTimeErrorS": metrics["railTimeErrorS"],
            "maxPositionErrorM": metrics["maxPositionErrorM"],
            "maxVelocityErrorMps": metrics["maxVelocityErrorMps"],
            "eventAltitudeAglM": ev["altitudeAglM"],
            "eventDeltaSAcrossRailM": ds,
            "committedSamplesCompared": metrics["committedSamplesCompared"],
            "referencePositionDeltaM": metrics["referencePositionDeltaM"],
            "referenceVelocityDeltaMps": metrics["referenceVelocityDeltaMps"],
            "referenceRailDeltaS": metrics["referenceRailDeltaS"],
            "splitAtThrustKnots": sidecar.get("splitAtThrustKnots") if sidecar else None,
            "cutKnotsS": sidecar.get("cutKnotsS") if sidecar else None,
            "clippedTrials": len(sidecar.get("clippedTrials", [])) if sidecar else None,
            "straddledTrials": len(sidecar.get("straddledTrials", [])) if sidecar else None,
            "stepWindowTrials": len(sidecar.get("stepWindowTrials", [])) if sidecar else None,
            "adaptiveTrialTotals": sidecar.get("adaptiveTrialTotals") if sidecar else None,
            "sidecar": sidecar,
            "report": report,
        }

    # The split-on default and the explicit split control are physically equal;
    # only the identity/effective-input envelope differs.
    strip_keys = ("contentIdentity", "activePolicies", "effectiveInputs")
    def stripped(r):
        v = json.loads(json.dumps(r))
        for k in strip_keys:
            v.pop(k, None)
        return v
    if stripped(rows["A-dt020"]["report"]) != stripped(rows["C-dt020"]["report"]):
        raise SystemExit("A20 and C20 differ physically; split policy is not the default")
    if rows["OLD-A-dt020"]["stdoutSha256"] != OLD_A20_STDOUT_SHA256:
        raise SystemExit("old profile example did not reproduce the recorded A20 bytes")
    if sha((OLD_RUN / "A-dt020.stdout").read_bytes()) != OLD_A20_STDOUT_SHA256:
        raise SystemExit("recorded A20 stdout changed")

    summary = {
        "schema": "rmp12-knot-split-rows/1.0.0",
        "newProfileBinary": {"path": str(new_binary), "sha256": sha(new_binary.read_bytes())},
        "oldProfileBinary": {"path": str(old_binary), "sha256": sha(old_binary.read_bytes())},
        "inputsFrom": str(OLD_RUN),
        "oldA20StdoutPinnedSha256": OLD_A20_STDOUT_SHA256,
        "rows": rows,
    }
    portable = json.loads(json.dumps(summary))
    for row in portable["rows"].values():
        row.pop("report", None)
    (output / "rows.json").write_text(json.dumps(portable, indent=2) + "\n")
    print(json.dumps({k: {m: v for m, v in r.items() if m not in ("sidecar", "report")}
                      for k, r in rows.items()}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
