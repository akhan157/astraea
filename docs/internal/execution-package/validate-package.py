#!/usr/bin/env python3
"""Read-only structural/integrity validation of the continuation package.

No build, subprocess, network, simulator or dataset reader. --snapshot additionally
checks selected accepted-source hashes; later engineering changes may legitimately
no longer match that historical baseline and must never be reset to satisfy it.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

PACKAGE = Path(__file__).resolve().parent
REPO = PACKAGE.parents[2]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(snapshot=False):
    index = read_json(PACKAGE / "packet-index.json")
    register = read_json(PACKAGE / "acceptance-register.json")
    packets = index["packets"]
    by_id = {p["id"]: p for p in packets}
    require(len(by_id) == len(packets) == 19, "Expected19 unique packets")
    require(set(by_id) == {f"RMP{i:02}" for i in range(1,20)}, "Packet IDs incomplete")
    require(index["firstPacket"] == "RMP01", "First packet changed without package review")
    acceptance = {}
    links = 0
    for packet in packets:
        packet_id = packet["id"]
        brief = PACKAGE / packet["brief"]
        require(brief.is_file(), f"Missing brief:{packet_id}")
        text = brief.read_text(encoding="utf-8")
        ids = sorted(set(re.findall(packet_id + r"-C\d{2}", text)))
        require(ids == packet["acceptanceIds"] and len(ids) >= 3,
                f"Acceptance IDs mismatch/incomplete:{packet_id}")
        require("assignment prompt" in text.lower(), f"Missing dispatch prompt:{packet_id}")
        require("evidence" in text.lower() and "negative" in text.lower(),
                f"Missing evidence/failure cases:{packet_id}")
        for dep in packet["closureDependencies"]:
            require(dep in by_id and dep != packet_id, f"Invalid dependency:{packet_id}:{dep}")
        for name in packet["repositoryFilesToInspect"] + packet["sharedFileLeasesToResolve"]:
            require((REPO / name).is_file(), f"Referenced source path missing:{packet_id}:{name}")
        require((PACKAGE / packet["evidenceTemplate"]).is_file(), f"Missing evidence template:{packet_id}")
        require((PACKAGE / packet["resultTemplate"]).is_file(), f"Missing result template:{packet_id}")
        for check_id in ids:
            require(check_id not in acceptance, f"Duplicate check:{check_id}")
            acceptance[check_id] = packet_id
    visited, active = set(), set()
    def visit(packet_id):
        require(packet_id not in active, f"Dependency cycle:{packet_id}")
        if packet_id in visited:
            return
        active.add(packet_id)
        for dep in by_id[packet_id]["closureDependencies"]:
            visit(dep)
        active.remove(packet_id)
        visited.add(packet_id)
    for packet_id in by_id:
        visit(packet_id)
    checks = register["checks"]
    require(len({c["id"] for c in checks}) == len(checks) == len(acceptance),
            "Acceptance register duplicate/missing checks")
    allowed = {"not_run", "in_progress", "pass", "fail", "blocked", "not_applicable"}
    for check in checks:
        require(acceptance.get(check["id"]) == check["packet"], f"Unknown check:{check['id']}")
        require(check["status"] in allowed, f"Unknown check status:{check['id']}")
        if check["status"] == "pass":
            require(check.get("sourceSha") and check.get("evidencePath") and
                    check.get("reviewDisposition") == "approved",
                    f"PASS lacks source/evidence/review:{check['id']}")
        if check["status"] == "not_applicable":
            require(check.get("notApplicableReason") and check.get("reviewDisposition") == "approved",
                    f"N/A lacks reviewed scope reason:{check['id']}")
    for path in PACKAGE.rglob("*.json"):
        read_json(path)
    for path in PACKAGE.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        for target in re.findall(r"\]\(([^)]+)\)",text):
            if "://" in target or target.startswith("#"):
                continue
            target = target.split("#",1)[0]
            require((path.parent / target).exists(), f"Broken link:{path.relative_to(PACKAGE)}:{target}")
            links += 1
    manifest_path = PACKAGE / "manifest.json"
    require(manifest_path.is_file(), "Package manifest missing")
    manifest = read_json(manifest_path)
    expected = manifest["packageFilesSha256"]
    actual = {str(p.relative_to(PACKAGE)) for p in PACKAGE.rglob("*")
              if p.is_file() and p != manifest_path and "__pycache__" not in p.parts}
    require(set(expected) == actual, "Manifest file list differs; review and regenerate after edits")
    for name, sha in expected.items():
        require(digest(PACKAGE / name) == sha, f"Package file hash changed:{name}")
    if snapshot:
        for name, sha in manifest["acceptedSourceSha256"].items():
            require(digest(REPO / name) == sha,
                    f"Accepted snapshot changed:{name}; inspect legitimate engineering changes, never reset")
    passed = sum(c["status"] == "pass" for c in checks)
    return {"status":"pass", "packets":len(packets), "acceptanceChecks":len(checks),
            "recordedPassedChecks":passed, "localLinks":links, "dependencyCycles":0,
            "packageHashes":len(expected), "acceptedSourceSnapshotChecked":snapshot,
            "scope":"package integrity only; no engineering/scientific/release test executed"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", action="store_true")
    args = parser.parse_args()
    try:
        result = validate(args.snapshot)
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"status":"fail", "error":str(error)}))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
