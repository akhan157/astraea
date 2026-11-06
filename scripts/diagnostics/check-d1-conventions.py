#!/usr/bin/env python3
"""RMP02-C02/C04 retained-record conventions checker. Not scientific qualification.

Consumes the retained D1 normalized/comparison records read-only, verifies their
bytes through the accepted RMP02a custody gate and retained manifests, recomputes
reference/datum algebra on the retained readings, and refuses the conflations the
records cannot license.

The source-to-P0 sign/basis transform is unresolved. Retained Cm is therefore
treated as one artificial pitch-moment scalar paired with CN, and each retained
moment starts at its recorded D-4013 datum. No nose moment, P0 axis or CP station
is asserted. Exit 0 means the bounded computational checks hold; signs, base
correction, geometry and qualification remain open.
"""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
FB = "docs/internal/accuracy-program/first-batch-2026-10-26/D1/"
SB = "docs/internal/accuracy-program/sb1-foundation-2026-10-26/D1/"
FILES = {
    "normalized": FB + "normalized-reading-points.json",
    "first_comparison": FB + "comparison.json",
    "first_subset": FB + "frozen-subset.json",
    "sb1_comparison": SB + "comparison.json",
    "sb1_subset": SB + "frozen-subset.json",
}
MANIFESTS = (FB + "artifact-manifest.json", SB + "artifact-manifest.json")
GATE = "scripts/diagnostics/check-reference-eligibility.py"
LEDGER = "docs/internal/execution-package/evidence/RMP02/eligibility.json"
FB_POINT_IDS = {
    "d4013-cn-m1p20-alpha-2", "d4013-cn-m1p20-alpha0", "d4013-cn-m1p20-alpha2",
    "d4013-cm-m1p20-alpha-2", "d4013-cm-m1p20-alpha0", "d4013-cm-m1p20-alpha2",
}
SB1_PAIR_IDS = {
    "d4013-cn-m0p60-target-2", "d4013-cn-m0p60-target+2",
    "d4013-cm-m0p60-target-2", "d4013-cm-m0p60-target+2",
}
INCH_M = 0.0254
CP_CANCELLATION_RELATIVE_BOUND = 64.0 * sys.float_info.epsilon
ARTIFICIAL_COORDINATES = (
    "artificial computational pair: retained CN as a normal scalar and retained Cm "
    "as one pitch-moment scalar; retained moments start at the recorded D-4013 "
    "drawing datum. No source-to-P0 basis/sign transform and no CP station is asserted."
)


class Refusal(ValueError):
    pass


def require(ok, reason):
    if not ok:
        raise Refusal(reason)


def number(value, label):
    require(type(value) in (int, float) and math.isfinite(value),
            f"{label}: finite number required")


def field(mapping, name, kind):
    require(isinstance(mapping, dict) and name in mapping, f"missing field: {name}")
    value = mapping[name]
    if kind == "number":
        number(value, name)
    elif kind == "string":
        require(isinstance(value, str) and bool(value), f"{name}: nonempty string required")
    elif kind == "interval":
        require(isinstance(value, list) and len(value) == 2, f"{name}: interval required")
        number(value[0], name)
        number(value[1], name)
        require(value[0] <= value[1], f"{name}: ordered interval required")
    elif kind == "list":
        require(isinstance(value, list), f"{name}: list required")
    return value


def object_field(mapping, name):
    require(isinstance(mapping, dict) and isinstance(mapping.get(name), dict),
            f"missing object: {name}")
    return mapping[name]


def strict_json_bytes(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid(value):
        raise Refusal(f"nonfinite JSON constant: {value}")
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def close(a, b, label):
    require(math.isclose(a, b, rel_tol=2e-12, abs_tol=1e-15), f"{label}: {a} != {b}")


def vector_close(a, b, label):
    require(len(a) == len(b), f"{label}: dimension mismatch")
    for index, (left, right) in enumerate(zip(a, b)):
        close(left, right, f"{label}[{index}]")


def overlaps(a, b):
    return a[0] <= b[1] and b[0] <= a[1]


def load_gate():
    spec = importlib.util.spec_from_file_location("rmp02_gate", ROOT / GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def local_path(root, name):
    path = PurePosixPath(name)
    require(name == path.as_posix() and not path.is_absolute() and ".." not in path.parts,
            f"noncanonical path: {name}")
    resolved = (root / name).resolve()
    require(resolved.is_relative_to(root.resolve()), f"path escapes repository: {name}")
    return resolved


def manifest_index(root):
    index = {}
    for manifest_name in MANIFESTS:
        manifest = strict_json_bytes(local_path(root, manifest_name).read_bytes())
        entries = manifest.get("files")
        require(isinstance(entries, list) and entries, f"manifest files missing: {manifest_name}")
        parent = PurePosixPath(manifest_name).parent
        for entry in entries:
            require(isinstance(entry, dict) and {"path", "bytes", "sha256"} <= set(entry),
                    "manifest entry fields missing")
            full = (parent / entry["path"]).as_posix()
            require(full not in index, f"duplicate manifest artifact: {full}")
            index[full] = entry
    return index


def load_records(root):
    gate = load_gate()
    custody = gate.check(root, gate.strict_json(root / LEDGER))
    require(custody["custody_status"] == "pass", "RMP02a custody gate did not pass")
    require(custody["qualified_cases"] == 0, "custody gate reported a qualification")
    index = manifest_index(root)
    data, provenance = {}, {}
    for key, name in FILES.items():
        path = local_path(root, name)
        require(path.is_file(), f"retained record absent: {name}")
        raw = path.read_bytes()
        entry = index.get(name)
        require(entry is not None, f"record not attested by a retained manifest: {name}")
        digest = hashlib.sha256(raw).hexdigest()
        require(entry["sha256"] == digest and entry["bytes"] == len(raw),
                f"retained custody mismatch: {name}")
        data[key] = strict_json_bytes(raw)
        provenance[key] = {"path": name, "bytes": len(raw), "sha256": digest,
                           "manifest_attested": True}
    return data, provenance


def normalized_points(data):
    norm = data["normalized"]
    require(isinstance(norm, list) and len(norm) == 6,
            "all six retained normalized records must be consumed")
    require({field(point, "point_id", "string") for point in norm} == FB_POINT_IDS,
            "normalized record set changed")
    points = []
    for point in norm:
        quantity = field(point, "quantity", "string")
        require(quantity in {"CN", "Cm"}, "normalized quantity changed")
        conditions = object_field(point, "conditions")
        reading = object_field(point, "reading")
        uncertainty = object_field(point, "uncertainty")
        value = field(reading, "value", "number")
        bound = (field(uncertainty, "digitization_bound", "number")
                 + field(uncertainty, "source_bound", "number"))
        points.append({
            "point_id": point["point_id"], "quantity": quantity,
            "nominal_target_deg": field(conditions, "nominal_target_deg", "number"),
            "alpha_read_deg": field(conditions, "alpha_read_deg", "number"),
            "value": value, "absolute_bound": bound,
            "interval": [value - bound, value + bound],
        })
    return points


def comparison_entries(data, points):
    by_id = {point["point_id"]: point for point in points}
    entries = field(data["first_comparison"], "comparisons", "list")
    require(len(entries) == 6, "all six retained comparison records must be consumed")
    require({field(entry, "point_id", "string") for entry in entries} == FB_POINT_IDS,
            "comparison record set changed")
    rows = []
    for entry in entries:
        point = by_id[entry["point_id"]]
        first = object_field(entry, "first")
        root = object_field(entry, "independent_root")
        first_value = field(first, "coefficient", "number")
        root_value = field(root, "coefficient", "number")
        close(root_value - first_value,
              field(entry, "coefficient_difference_root_minus_first", "number"),
              "coefficient difference")
        rows.append({"point_id": entry["point_id"], "quantity": point["quantity"],
                     "nominal_target_deg": point["nominal_target_deg"],
                     "first": first_value, "independent_root": root_value,
                     "root_minus_first": root_value - first_value})
    return rows


def sb1_pairs(data):
    pairs = field(data["sb1_comparison"], "pairs", "list")
    require(len(pairs) == 4, "all four retained sb1 comparison pairs must be consumed")
    require({field(entry, "point_id", "string") for entry in pairs} == SB1_PAIR_IDS,
            "sb1 pair set changed")
    rows = []
    for entry in pairs:
        quantity = field(entry, "quantity", "string")
        require(quantity in {"CN", "Cm"}, "sb1 quantity changed")
        target = field(entry, "nominal_alpha_target_deg", "number")
        readers = {}
        for reader_name in ("first_reader", "independent_root_reader"):
            reader = object_field(entry, reader_name)
            value = field(reader, "coefficient", "number")
            interval = field(reader, "coefficient_read_interval", "interval")
            require(interval[0] <= value <= interval[1],
                    "coefficient interval does not contain its retained reading")
            readers[reader_name] = {"value": value, "interval": interval}
        require(overlaps(readers["first_reader"]["interval"],
                         readers["independent_root_reader"]["interval"]),
                "retained reader intervals must overlap; no uncertainty reduction")
        close(readers["independent_root_reader"]["value"]
              - readers["first_reader"]["value"],
              field(object_field(entry, "root_minus_first"), "coefficient", "number"),
              "sb1 coefficient difference")
        rows.append({"point_id": entry["point_id"], "quantity": quantity,
                     "nominal_alpha_target_deg": target, "readers": readers})
    return rows


def retained_sources(data):
    subset = data["first_subset"]
    geometry = object_field(object_field(subset, "geometry_and_references"), "sources")
    d4013 = object_field(geometry, "19670020050")
    d4014 = object_field(geometry, "19670020031")
    uncertainty = object_field(object_field(subset, "source_uncertainty"), "19670020050")
    return {
        "d4013": {
            "drawing_station_d": field(d4013, "moment_station_over_d_drawing", "number"),
            "fraction_length": field(d4013, "moment_fraction_length_text", "number"),
            "length_d": field(d4013, "length_over_d", "number"),
            "diameter_in": field(d4013, "diameter_in_source", "number"),
            "diameter_report_m": field(d4013, "short_body_diameter_m_report_decimal", "number"),
        },
        "d4014": {
            "station_in": field(d4014, "short_moment_station_in", "number"),
            "length_in": field(d4014, "short_length_in", "number"),
            "diameter_in": field(d4014, "diameter_in", "number"),
            "declared_fraction": field(d4014, "moment_fraction_text", "number"),
        },
        "raw_ca_bound": field(uncertainty, "CA_bound", "number"),
        "series": field(subset, "series", "list"),
    }


def references(diameter_m):
    return {"diameter_m": diameter_m,
            "area_m2": math.pi * diameter_m * diameter_m / 4.0,
            "length_m": diameter_m}


def reference_variants(sources):
    d4013 = sources["d4013"]
    drawing_m = d4013["diameter_in"] * INCH_M
    report_m = d4013["diameter_report_m"]
    return {"drawing-2.25in": references(drawing_m),
            "report-5.72cm": references(report_m)}, abs(report_m - drawing_m) / drawing_m


def d4013_datum(sources, diameter_m):
    d4013 = sources["d4013"]
    drawing_d = d4013["drawing_station_d"]
    text_d = d4013["fraction_length"] * d4013["length_d"]
    return {"drawing_station_from_nose_d": drawing_d,
            "text_fraction_station_from_nose_d": text_d,
            "label_delta_d": drawing_d - text_d,
            "drawing_station_m": drawing_d * diameter_m,
            "text_station_m": text_d * diameter_m}


def d4014_datum(sources):
    d4014 = sources["d4014"]
    return {"station_from_nose_in": d4014["station_in"],
            "length_in": d4014["length_in"],
            "fraction_length": d4014["station_in"] / d4014["length_in"],
            "declared_fraction": d4014["declared_fraction"],
            "station_m": d4014["station_in"] * INCH_M,
            "length_m": d4014["length_in"] * INCH_M}


def station_separation(sources, d4013_values, d4014_values):
    diameter_in = sources["d4013"]["diameter_in"]
    bracket = []
    for label in ("drawing_station_from_nose_d", "text_fraction_station_from_nose_d"):
        station_in = d4013_values[label] * diameter_in
        separation_in = station_in - d4014_values["station_from_nose_in"]
        bracket.append({
            "d4013_station_label": label,
            "d4013_equivalent_station_in": station_in,
            "separation_in": separation_in,
            "separation_over_length": separation_in / d4014_values["length_in"],
            "moment_shift_at_unit_normal": -separation_in / diameter_in,
        })
    return {"d4014_station_in": d4014_values["station_from_nose_in"],
            "d4014_length_in": d4014_values["length_in"],
            "bracket": bracket}


def computational_pair(normal, pitch_moment):
    return {"normal": normal, "pitch_moment": pitch_moment,
            "basis": ARTIFICIAL_COORDINATES}


def re_reference_pair(pair, old, new):
    force_factor = old["area_m2"] / new["area_m2"]
    moment_factor = force_factor * old["length_m"] / new["length_m"]
    return {"normal": force_factor * pair["normal"],
            "pitch_moment": moment_factor * pair["pitch_moment"],
            "basis": ARTIFICIAL_COORDINATES}


def dimensional_pair(pair, dynamic_pressure, refs):
    force_scale = dynamic_pressure * refs["area_m2"]
    return {"normal_force_n": force_scale * pair["normal"],
            "pitch_moment_nm": force_scale * refs["length_m"] * pair["pitch_moment"]}


def translate_pair(pair, x_from_m, x_to_m, length_m):
    """Artificial pitch scalar: M_to = M_from - (x_to - x_from)/L * normal."""
    require(length_m > 0.0, "reference length required")
    shift = (x_to_m - x_from_m) / length_m
    return {"normal": pair["normal"],
            "pitch_moment": pair["pitch_moment"] - shift * pair["normal"],
            "basis": ARTIFICIAL_COORDINATES}


def translate_wrench(force, moment, r_from, r_to, length_m):
    """P0 formula: M_to = M_from + (r_from - r_to)/L x F (full 3D cross)."""
    require(length_m > 0.0, "reference length required")
    delta = [r_from[index] - r_to[index] for index in range(3)]
    cross = [delta[1] * force[2] - delta[2] * force[1],
             delta[2] * force[0] - delta[0] * force[2],
             delta[0] * force[1] - delta[1] * force[0]]
    return [moment[index] + cross[index] / length_m for index in range(3)]


def relative_residual(value, interval, model):
    require(value is not None, "no measured center; relative residual refused")
    require(not (interval[0] <= 0.0 <= interval[1]),
            "near-zero floor: interval encloses zero; absolute uncertainty governs")
    require(value != 0.0, "zero denominator")
    return (model - value) / value


def cp_reason(total_c, interval, sum_abs_c=None):
    require(math.isfinite(total_c), "nonfinite denominator")
    if interval is not None:
        require(len(interval) == 2 and interval[0] <= total_c <= interval[1],
                "C interval must enclose total C")
        if interval[0] <= 0.0 <= interval[1]:
            return "UncertaintyContainsZero"
    if total_c == 0.0:
        return "ZeroDenominator"
    if sum_abs_c is not None:
        require(sum_abs_c >= abs(total_c), "absolute sum must bound signed sum")
        if abs(total_c) / sum_abs_c <= CP_CANCELLATION_RELATIVE_BOUND:
            return "NumericallyIllConditioned"
    return None


def equivalent_station(cm, cn, cn_interval, datum_m, length_m, sum_abs_c=None):
    reason = cp_reason(cn, cn_interval, sum_abs_c)
    require(reason is None, f"CpUnavailable::{reason}")
    return datum_m + length_m * cm / cn


def corrected_axial(raw, base, sign):
    require(sign in (-1, 1),
            "base-correction sign not evidenced in retained records; "
            "raw/base/corrected axial conflation refused")
    return raw + sign * base


def corrected_uncertainty(raw_bound, base_uncertainty):
    require(raw_bound == 0.004, "raw CA bound changed")
    require(base_uncertainty is not None,
            "corrected axial uncertainty requires a base/chamber term; "
            "raw CA bound must not be transferred")
    return raw_bound + abs(base_uncertainty)


def merge_cm_direct(source_a, source_b):
    require(source_a == source_b,
            "direct D4013/D4014 moment-station conflation refused; "
            "translate with original S/L/datum first")


def first_batch_pairs(points):
    by_key = {(point["quantity"], point["nominal_target_deg"]): point for point in points}
    pairs = []
    for target in (-2, 0, 2):
        cn = by_key[("CN", target)]
        cm = by_key[("Cm", target)]
        pairs.append({"id": f"d4013-m1p20-nominal-{target}",
                      "record_set": "first-batch normalized-reading-points.json",
                      "nominal_target_deg": target,
                      "cn": cn["value"], "cm": cm["value"],
                      "cn_interval": cn["interval"],
                      "cn_alpha_deg": cn["alpha_read_deg"],
                      "cm_alpha_deg": cm["alpha_read_deg"]})
    return pairs


def sb1_wrench_pairs(pairs):
    by_target = {}
    for entry in pairs:
        by_target.setdefault(entry["nominal_alpha_target_deg"], {})[entry["quantity"]] = entry
    require(set(by_target) == {-2, 2}, "sb1 paired targets changed")
    rows = []
    for target in (-2, 2):
        for reader_name, label in (("first_reader", "first"),
                                   ("independent_root_reader", "independent-root")):
            cn = by_target[target]["CN"]["readers"][reader_name]
            cm = by_target[target]["Cm"]["readers"][reader_name]
            rows.append({"id": f"d4013-m0p60-nominal-{target}::{label}",
                         "record_set": "sb1 comparison.json",
                         "nominal_target_deg": target,
                         "cn": cn["value"], "cm": cm["value"],
                         "cn_interval": cn["interval"]})
    return rows


def invariance(pairs, variants, datums, d4014_values):
    reference_rows, translation_rows = [], []
    for pair in pairs:
        pair_wrench = computational_pair(pair["cn"], pair["cm"])
        interval = pair["cn_interval"]
        contains_zero = interval[0] <= 0.0 <= interval[1]
        for old_name, old in variants.items():
            base = dimensional_pair(pair_wrench, 1.0, old)
            for new_name, new in variants.items():
                moved = dimensional_pair(re_reference_pair(pair_wrench, old, new), 1.0, new)
                close(moved["normal_force_n"], base["normal_force_n"],
                      f"{pair['id']} F {old_name}->{new_name}")
                close(moved["pitch_moment_nm"], base["pitch_moment_nm"],
                      f"{pair['id']} M {old_name}->{new_name}")
                if contains_zero:
                    ratio_m = None
                    reason = "UncertaintyContainsZero"
                else:
                    ratio_m = old["length_m"] * pair["cm"] / pair["cn"]
                    scaled = re_reference_pair(pair_wrench, old, new)
                    ratio_new = new["length_m"] * scaled["pitch_moment"] / scaled["normal"]
                    close(ratio_new, ratio_m, f"{pair['id']} ratio {old_name}->{new_name}")
                    reason = None
                reference_rows.append({
                    "pair": pair["id"], "record_set": pair["record_set"],
                    "reference_pair": f"{old_name}->{new_name}",
                    "force_preserved": True, "moment_preserved": True,
                    "length_times_cm_over_cn_m": ratio_m, "ratio_cp_reason": reason,
                })
        for name, refs in variants.items():
            datum = datums[name]
            x_from = datum["drawing_station_m"]
            x_to = d4014_values[name]["station_m"]
            forward = translate_pair(pair_wrench, x_from, x_to, refs["length_m"])
            back = translate_pair(forward, x_to, x_from, refs["length_m"])
            close(back["pitch_moment"], pair["cm"], f"{pair['id']} datum roundtrip {name}")
            full = translate_wrench([0.0, 0.0, -pair["cn"]],
                                    [pair["cm"], 0.0, 0.0],
                                    [0.0, -x_from, 0.0], [0.0, -x_to, 0.0],
                                    refs["length_m"])
            close(full[0], forward["pitch_moment"],
                  f"{pair['id']} scalar/full-cross {name}")
            translation_rows.append({
                "pair": pair["id"], "reference": name,
                "source_datum": "recorded D-4013 drawing station from the nose",
                "source_station_m": x_from, "target_station_m": x_to,
                "forward_pitch_moment": forward["pitch_moment"],
                "shift_at_unit_normal": -(x_to - x_from) / refs["length_m"],
                "roundtrip_recovered_moment": True,
                "scalar_matches_full_cross": True,
            })
    return reference_rows, translation_rows


def translation_fixtures(variants, datums, d4014_values):
    force = [-2.0, -1.0, -3.0]
    moment = [6.0, 0.0, -4.0]
    computed = translate_wrench(force, moment, [0.0, 0.0, 0.0], [0.0, -1.0, 0.0], 1.0)
    expected = [3.0, 0.0, -2.0]
    vector_close(computed, expected, "P0 section 7.2 translation fixture")
    refs = variants["drawing-2.25in"]
    x_from = datums["drawing-2.25in"]["drawing_station_m"]
    x_to = d4014_values["drawing-2.25in"]["station_m"]
    scalar = translate_pair(computational_pair(1.0, 0.5), x_from, x_to, refs["length_m"])
    full = translate_wrench([0.0, 0.0, -1.0], [0.5, 0.0, 0.0],
                            [0.0, -x_from, 0.0], [0.0, -x_to, 0.0], refs["length_m"])
    close(full[0], scalar["pitch_moment"], "D4013-datum forward fixture scalar/full-cross")
    return {
        "p0_known_value_fixture": {
            "force": force, "moment_at_from": moment,
            "r_from": [0.0, 0.0, 0.0], "r_to": [0.0, -1.0, 0.0], "length": 1.0,
            "expected_moment": expected, "computed_moment": computed,
        },
        "d4013_datum_forward_fixture": {
            "normal": 1.0, "pitch_moment_at_source_datum": 0.5,
            "source_station_m": x_from, "target_station_m": x_to,
            "length_m": refs["length_m"], "expected_shift": (x_from - x_to) / refs["length_m"],
            "scalar_forward_pitch_moment": scalar["pitch_moment"],
            "full_cross_forward_pitch_moment": full[0],
        },
    }


def nearzero_rows(points, comparisons, pairs, disposition):
    rows = []
    for point in points:
        contains_zero = point["interval"][0] <= 0.0 <= point["interval"][1]
        rows.append({
            "record": "normalized-reading-points.json",
            "point_id": point["point_id"], "quantity": point["quantity"],
            "value": point["value"], "absolute_bound": point["absolute_bound"],
            "interval": point["interval"], "interval_encloses_zero": contains_zero,
            "relative_residual": ("refused-absolute-floor-governs" if contains_zero
                                  else "admissible-bounded"),
        })
    by_id = {point["point_id"]: point for point in points}
    for entry in comparisons:
        point = by_id[entry["point_id"]]
        contains_zero = point["interval"][0] <= 0.0 <= point["interval"][1]
        rows.append({
            "record": "first-batch comparison.json",
            "point_id": entry["point_id"], "quantity": entry["quantity"],
            "value": point["value"], "absolute_bound": point["absolute_bound"],
            "first_reader": entry["first"], "independent_root": entry["independent_root"],
            "root_minus_first": entry["root_minus_first"],
            "interval": point["interval"], "interval_encloses_zero": contains_zero,
            "relative_residual": ("refused-absolute-floor-governs" if contains_zero
                                  else "admissible-bounded"),
        })
    for entry in pairs:
        for reader_name, reader in entry["readers"].items():
            interval = reader["interval"]
            contains_zero = interval[0] <= 0.0 <= interval[1]
            rows.append({
                "record": "sb1 comparison.json",
                "point_id": f"{entry['point_id']}::{reader_name}",
                "quantity": entry["quantity"], "value": reader["value"], "interval": interval,
                "interval_encloses_zero": contains_zero,
                "relative_residual": ("refused-absolute-floor-governs" if contains_zero
                                      else "admissible-bounded"),
            })
    for quantity, text in disposition.items():
        if quantity not in {"CN", "Cm"}:
            continue
        rows.append({
            "record": "sb1 comparison.json",
            "point_id": f"d4013-{quantity.lower()}-m0p60-target0",
            "quantity": quantity, "value": None, "interval": None,
            "relative_residual": "not-computable-no-measured-center",
            "disposition": text,
        })
    return rows


def axial_state(sources):
    series = [entry for entry in sources["series"]
              if str(entry.get("quantity", "")).startswith("CA")]
    require(series, "axial series missing")
    for entry in series:
        field(entry, "id", "string")
        require(entry.get("status") == "frozen_pending_extraction",
                "unretained axial value: series must remain unextracted")
    return {
        "series": [{"series_id": entry["id"], "quantity": entry["quantity"],
                    "status": entry["status"]} for entry in series],
        "raw_ca_bound": sources["raw_ca_bound"],
        "corrected_ca_bound": None,
        "base_correction_sign": None,
        "status": "blocked-unresolved-base-correction-sign-and-uncertainty-term",
        "d4014_chamber_note": "D-4014 raw CA is uncorrected; chamber contribution is not extracted",
    }


def exercise_guards(points, disposition):
    zero_cn = next(point for point in points
                   if point["point_id"] == "d4013-cn-m1p20-alpha0")
    checks = []

    def refused(operation, reason_fragment, action):
        try:
            action()
        except Refusal as exc:
            require(reason_fragment in str(exc),
                    f"guard refused for an unexpected reason: {exc}")
            checks.append({"operation": operation, "refused": str(exc)})
        else:
            raise Refusal(f"guard did not refuse: {operation}")

    refused("direct D4013/D4014 Cm merge", "moment-station conflation",
            lambda: merge_cm_direct("19670020050", "19670020031"))
    refused("raw CA bound as corrected uncertainty", "must not be transferred",
            lambda: corrected_uncertainty(0.004, None))
    refused("raw/base axial merge without sign", "base-correction sign",
            lambda: corrected_axial(0.1, 0.02, None))
    refused("relative residual at zero-enclosing interval", "absolute uncertainty governs",
            lambda: relative_residual(zero_cn["value"], zero_cn["interval"], 0.2))
    refused("C_m/C_N ratio with zero-enclosing C_N", "UncertaintyContainsZero",
            lambda: equivalent_station(0.0, zero_cn["value"], zero_cn["interval"], 0.7, 0.05715))
    require(cp_reason(0.0, None) == "ZeroDenominator",
            "zero denominator must not become a station")
    require(cp_reason(1.0, None, 1e16) == "NumericallyIllConditioned",
            "cancellation policy not mirrored")
    require(disposition.get("CN") and disposition.get("Cm"),
            "excluded near-zero targets missing")
    return checks


def evaluate(data):
    points = normalized_points(data)
    comparisons = comparison_entries(data, points)
    pairs = sb1_pairs(data)
    sources = retained_sources(data)
    disposition = object_field(data["sb1_comparison"], "nearzero_disposition")
    variants, diameter_relative = reference_variants(sources)
    datums = {name: d4013_datum(sources, refs["diameter_m"])
              for name, refs in variants.items()}
    d4014_values = {name: d4014_datum(sources) for name in variants}
    separations = {name: station_separation(sources, datums[name], d4014_values[name])
                   for name in variants}
    wrench_pairs = first_batch_pairs(points) + sb1_wrench_pairs(pairs)
    reference_rows, translation_rows = invariance(wrench_pairs, variants, datums,
                                                  d4014_values)
    return {
        "schema": "rmp02-d1-conventions-check/2.0.0",
        "conventions_status": "computational-invariance-verified-signs-open",
        "artificial_coordinates": ARTIFICIAL_COORDINATES,
        "custody_status": "pass",
        "qualified_cases": 0,
        "records_consumed": {
            "normalized_points": 6,
            "first_batch_comparisons": 6,
            "sb1_comparison_pairs": 4,
            "sb1_excluded_nearzero_targets": 2,
            "sb1_reader_coefficients": 8,
        },
        "reference_variants": variants,
        "diameter_relative_difference": diameter_relative,
        "d4013_datums": datums,
        "d4014_datums": d4014_values,
        "station_separation": separations,
        "paired_wrenches": [
            {key: pair[key] for key in ("id", "record_set", "nominal_target_deg",
                                        "cn", "cm", "cn_interval")}
            for pair in wrench_pairs
        ],
        "reference_invariance": reference_rows,
        "datum_translation": translation_rows,
        "translation_fixtures": translation_fixtures(variants, datums, d4014_values),
        "nearzero_floor": nearzero_rows(points, comparisons, pairs, disposition),
        "axial": axial_state(sources),
        "guards_exercised": exercise_guards(points, disposition),
        "unresolved": [
            "source body-axis triad and positive moment sense not transcribed; "
            "P0-to-source sign transform unverified",
            "D4014 pitch-test numeric roll mapping to the simulator is null/unreviewed",
            "base-correction sign and corrected-CA base-pressure uncertainty term "
            "are absent from retained records",
            "D4013 12.74d (70%) text vs 12.75d drawing label bracket retained; "
            "the 0.01d difference is reported, not resolved",
            "D4014 25.95in datum is distinct from the D4013 70% convention; "
            "cross-source Cm translation unexecuted because D4014 Cm is unextracted",
            "no retained D4014 numeric CN/Cm/CA values",
            "reference area value is derived from the diameter declarations, "
            "not an independently transcribed source area",
            "native geometry, reflex lip, finite tip and fin anchor representation open (RMP08)",
            "independent scientific review pending",
        ],
        "not_claimed": [
            "scientific qualification",
            "sign/datum/base closure",
            "CP or derivative validity",
            "geometry representability",
            "model accuracy",
        ],
    }


def main():
    try:
        data, provenance = load_records(ROOT)
        result = evaluate(data)
    except (Refusal, ValueError, OSError, KeyError, TypeError) as exc:
        print(json.dumps({"conventions_status": "refused", "reason": str(exc)}))
        return 1
    result["provenance"] = provenance
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
