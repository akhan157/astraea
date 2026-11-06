#!/usr/bin/env python3
"""RMP02a frozen exclusion/custody gate, NOT empirical model qualification.

Only the four already-exposed public inventory entries are interpreted. Other
retained artifacts are hashed, not parsed as measurements. No network or PDF,
image, model, trajectory, fitting, or outcome reader is invoked.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys

LEDGER = "docs/internal/execution-package/evidence/RMP02/eligibility.json"
D1 = "docs/internal/accuracy-program/first-batch-2026-10-26/D1/"
SB1 = "docs/internal/accuracy-program/sb1-foundation-2026-10-26/D1/"
INVENTORY = "docs/internal/accuracy-program/execution-2026-10-25/candidateinventory.json"
BASIS = {INVENTORY,
         "docs/internal/accuracy-program/diagnostics/A1b-reference-eligibility-2026-10-26.md",
         SB1 + "geometry-ledger.json", SB1 + "frozen-subset.json", SB1 + "README.md",
         D1 + "frozen-subset.json", D1 + "README.md"}
NATIVE = {"crates/astraea-engine/src/sb1_geometry.rs",
          "crates/astraea-core/src/aero_coefficients.rs"}
MANIFESTS = {D1 + "artifact-manifest.json", SB1 + "artifact-manifest.json"}
SOURCE_IDS = {"19670020050", "19670020031", "19930087740", "19630004995"}
FEATURES = {"nose_profile", "physical_tip", "centerbody_tail_base", "fin_planform",
            "fin_section", "fin_roots_attachments", "support_protrusions"}
GAPS = {"area_length", "axes_signs", "moment_station", "reynolds",
        "incidence_roll", "power_base", "trip_surface", "extraction_uncertainty"}
CASES = {"d4013-m0p60": ("19670020050", 0.6),
         "d4013-m1p20": ("19670020050", 1.2),
         "d4014-m1p50": ("19670020031", 1.5),
         "a53d02-unselected": ("19930087740", None),
         "r100-unselected": ("19630004995", None)}
# This version freezes exclusion, not an editable self-certification mechanism.
FEATURE_STATUS = {"unsupported", "unclosed", "type-supported-not-reconstructed"}
QUANTITIES = {
    "d4013-m0p60": {"CA": "not-selected", "CN": "retained-provisional", "Cm": "retained-provisional", "CD": "not-selected"},
    "d4013-m1p20": {"CA": "frozen-unextracted", "CN": "retained-provisional", "Cm": "retained-provisional", "CD": "not-selected"},
    "d4014-m1p50": {"CA": "frozen-unextracted", "CN": "frozen-unextracted", "Cm": "frozen-unextracted", "CD": "not-selected"},
    "a53d02-unselected": {"CA": "not-selected", "CN": "not-selected", "Cm": "not-selected", "CD": "inventory-only"},
    "r100-unselected": {"CA": "not-selected", "CN": "not-selected", "Cm": "not-selected", "CD": "inventory-only"},
}


class Refusal(ValueError):
    pass


def require(ok, reason):
    if not ok:
        raise Refusal(reason)


def keys(value, expected, label):
    require(isinstance(value, dict) and set(value) == set(expected),
            f"{label}: missing/unknown fields")


def nonempty(value, label):
    require(isinstance(value, str) and bool(value.strip()), f"{label}: text required")


def strict_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid(value):
        raise Refusal(f"nonfinite JSON constant: {value}")
    return json.loads(path.read_text(), object_pairs_hook=pairs, parse_constant=invalid)


def local(root, name):
    require(isinstance(name, str) and "\\" not in name, "invalid local path")
    p = PurePosixPath(name)
    require(not p.is_absolute() and ".." not in p.parts and name == p.as_posix(),
            f"noncanonical/escaping path: {name}")
    require(name.startswith("docs/internal/") or name in NATIVE,
            f"path outside leased public-source/native basis: {name}")
    resolved = (root / name).resolve()
    require(resolved.is_relative_to(root.resolve()), f"symlink escapes repository: {name}")
    require(resolved.is_file(), f"artifact absent: {name}")
    return resolved


def identity(root, name):
    data = local(root, name).read_bytes()
    return {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def pinned(root, records, expected, label):
    require(isinstance(records, list), f"{label}: list required")
    names = []
    for entry in records:
        keys(entry, {"path", "bytes", "sha256"}, label)
        name = entry["path"]
        require(name in expected, f"{label}: unexpected basis file {name}")
        require(type(entry["bytes"]) is int and entry["bytes"] > 0,
                f"{label}: invalid byte size")
        require(identity(root, name) == entry, f"{label}: changed/invalid artifact {name}")
        names.append(name)
    require(len(names) == len(set(names)) and set(names) == expected,
            f"{label}: duplicate/missing basis")


def manifest_files(root, manifest_path):
    manifest = strict_json(local(root, manifest_path))
    entries = manifest.get("files")
    require(isinstance(entries, list) and bool(entries), "manifest files missing")
    parent = PurePosixPath(manifest_path).parent
    names = set()
    for entry in entries:
        keys(entry, {"path", "bytes", "sha256"}, "manifest entry")
        name = entry["path"]
        require(isinstance(name, str) and "\\" not in name, "invalid manifest path")
        p = PurePosixPath(name)
        require(not p.is_absolute() and ".." not in p.parts and name == p.as_posix(),
                "manifest path escapes/is noncanonical")
        require(name not in names, "duplicate manifest artifact")
        names.add(name)
        full_name = str(parent / p)
        require(type(entry["bytes"]) is int and entry["bytes"] > 0,
                "invalid manifest byte size")
        actual = identity(root, full_name)
        require(actual["bytes"] == entry["bytes"] and actual["sha256"] == entry["sha256"],
                f"retained custody mismatch: {full_name}")
    return len(names)


def check(root, ledger):
    keys(ledger, {"schema", "scope", "basis", "native_source", "custody_manifests",
                  "sources", "cases", "qualification_claim"}, "ledger")
    require(ledger["schema"] == "rmp02-retained-source-exclusions/1.0.0", "unsupported schema")
    require(ledger["scope"] == "retained-public-development-only-no-new-readings",
            "unsupported evidence scope")
    require(ledger["qualification_claim"] is False,
            "this exclusion packet cannot certify native coefficient qualification")
    pinned(root, ledger["basis"], BASIS, "source basis")
    pinned(root, ledger["native_source"], NATIVE, "native boundary; rereview on source change")
    pinned(root, ledger["custody_manifests"], MANIFESTS, "retained manifests")
    count = sum(manifest_files(root, p) for p in sorted(MANIFESTS))
    inventory = strict_json(local(root, INVENTORY))
    sources = ledger["sources"]
    require(isinstance(sources, list), "sources must be a list")
    seen = set()
    for source in sources:
        keys(source, {"id", "pdf_sha256", "pdf_bytes", "original_pdf_status", "rights_basis"}, "source")
        sid = source["id"]
        require(sid in SOURCE_IDS and sid not in seen, "unknown/duplicate source")
        seen.add(sid)
        records = [s for s in inventory["candidates"] if s["id"] == sid]
        require(len(records) == 1, "inventory source missing/duplicated")
        original = records[0]
        require(source["pdf_sha256"] == original["access"]["sha256"]
                and type(source["pdf_bytes"]) is int
                and source["pdf_bytes"] == original["access"]["bytes"], "source PDF identity changed")
        require(source["original_pdf_status"] == "not-retained-in-repository",
                "original PDF availability requires separately verified evidence")
        require(source["rights_basis"] == original["rights"], "rights provenance changed")
    require(seen == SOURCE_IDS, "missing source")
    rows = ledger["cases"]
    require(isinstance(rows, list), "cases must be a list")
    seen = set()
    results = []
    for row in rows:
        keys(row, {"id", "source", "mach", "selection", "features", "convention_gaps",
                   "quantities", "nearzero", "extension_request", "native_qualification"}, "case")
        cid = row["id"]
        require(cid in CASES and cid not in seen, "unknown/duplicate case")
        seen.add(cid)
        require((row["source"], row["mach"]) == CASES[cid]
                and (row["mach"] is None or type(row["mach"]) is float), "frozen case changed")
        nonempty(row["selection"], "condition/selection")
        nonempty(row["nearzero"], "nearzero exclusions/floors")
        nonempty(row["extension_request"], "extension request")
        require(row["native_qualification"] is False, "unqualified retained case promoted")
        keys(row["features"], FEATURES, "geometry feature coverage")
        reasons = []
        for feature, decision in sorted(row["features"].items()):
            keys(decision, {"status", "basis"}, "feature")
            require(decision["status"] in FEATURE_STATUS, "feature closure requires new reviewed contract")
            nonempty(decision["basis"], "feature basis")
            reasons.append(f"geometry:{feature}:{decision['status']}")
        keys(row["convention_gaps"], GAPS, "convention gap coverage")
        for gap, detail in sorted(row["convention_gaps"].items()):
            nonempty(detail, "open convention")
            reasons.append(f"convention:{gap}")
        keys(row["quantities"], {"CA", "CN", "Cm", "CD"}, "paired quantities")
        require(row["quantities"] == QUANTITIES[cid],
                "quantity availability changed without separately reviewed extraction contract")
        # Provisional paired normal force/moment readings are not a full source.
        reasons.append("paired-force-independent-moment-not-qualified")
        reasons.append("native-axial-input-is-prescribed-not-qualified-prediction")
        domain = "unselected" if row["mach"] is None else (
            "within-Mach-only-other-conditions-open" if 0 <= row["mach"] < 0.8 else "outside-SB1-Mach-domain")
        if domain != "within-Mach-only-other-conditions-open":
            reasons.append(domain)
        results.append({"id": cid, "mach_status": domain,
                        "native_qualification": False, "blocked_by": reasons})
    require(seen == set(CASES), "missing frozen case")
    return {"schema": "rmp02-retained-source-gate-result/1.0.0", "custody_status": "pass",
            "manifest_artifact_entries_verified": count, "retained_manifests_verified": len(MANIFESTS),
            "original_pdfs_verified": 0, "qualified_cases": 0,
            "qualification_status": "blocked-not-a-model-pass", "cases": results}


def main():
    root = Path(__file__).resolve().parents[2]
    try:
        result = check(root, strict_json(local(root, LEDGER)))
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(json.dumps({"custody_status": "refused", "reason": str(exc)}))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
