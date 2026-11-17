#!/usr/bin/env python3
"""BX1 blind outcome extractor.

Applies ONLY the frozen rules in
  astraea-evidence/goal-collegiate-accuracy/step4-blind/FROZEN-RULES-FOR-EXTRACTOR.json
to the 12 sealed flight logs of V001 (Estes Emerald Streak) and V002 (LOC DD
Vulcanite). Runs on the custody copies under
  astraea-evidence/goal-collegiate-accuracy/step4-blind/outcomes/
so the sealed originals are opened once (hash + copy) and never again.

Blindness: this file contains no prediction, no BL1 output and no expected
apogee. It reads the frozen rules, the custody manifest (hashes/paths only),
and the 12 copies.

Operational definitions are fixed in OP_DEFS below and were written before any
altitude series was examined. No threshold is adjusted after a result is seen.
"""

import csv
import hashlib
import json
import os
import re
import statistics
import sys
from datetime import datetime, timezone

EVID = "/home/ak/astraea-evidence"
MANIFEST = f"{EVID}/R6-public-cohort/blind-manifest.json"
RULES = f"{EVID}/goal-collegiate-accuracy/step4-blind/FROZEN-RULES-FOR-EXTRACTOR.json"
COPIES = f"{EVID}/goal-collegiate-accuracy/step4-blind/outcomes"
CUSTODY_COPY_LOG = f"{COPIES}/custody-copy.log"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

FT_TO_M = 0.3048  # 1 ft = 0.3048 m exactly

# Sealed set: ids in the spec's listed order, matched by sha256 prefix + motor.
# key: frozen-rules flight id; sha256 taken from the custody manifest.
FLIGHTS = [
    # (id, motor, format, sha256, sealed evidence_ref basename)
    ("V001-01", "Estes C6-5", "pressure",
     "013c6fd5d14cb8a13b4c6d84cc0aa38deac16612300a9a2ac499b8b92ae31184",
     "Emerald_Streak_9MAR2017_C6-5_1.csv"),
    ("V001-02", "Estes C6-5", "pressure",
     "cbb9fb4266e7a55a559e76a8f226ca21ee135e5666271a608bdc618a9d0e3db3",
     "Emerald_Streak_9MAR2017_C6-5_2.csv"),
    ("V001-03", "Estes C6-5", "pressure",
     "de70993207aef53357bd7a8c9dd4ddfd916bc6297e9d6680337cf75f5ab83e9b",
     "Emerald_Streak_9MAR2017_C6-5_3.csv"),
    ("V001-04", "Estes C6-7", "pressure",
     "6069b319732017e1c7f33ff7798f758301f8c45c7c3bd258d36b048658154fb9",
     "Emerald_Streak_9MAR2017_C6-7_1.csv"),
    ("V001-05", "Estes C6-7", "pressure",
     "70ca39f9ed40c84d5dc558f8a166219e3cb71a8af0715edabafd02f65e884137",
     "Emerald_Streak_9MAR2017_C6-7_2.csv"),
    ("V001-06", "Estes C6-7", "pressure",
     "7bef1affbe0721f8aa22d799775d3b468f561b87cf95fb2f952d3be134c9f455",
     "Emerald_Streak_9MAR2017_C6-7_3.csv"),
    ("V001-07", "AeroTech D13-10W", "pressure",
     "331cb6495d93760025fd526b7e63b727c03723bc0a6d7bba1590a5683937402e",
     "Emerald_Streak_9MAR2017_D13-10W_1.csv"),
    ("V001-08", "Quest QC6-5", "pressure",
     "9be8158fc3e3329fad7b80d55068ffaffaa10978bd996afb5895c745c46c7311",
     "Emerald_Streak_9MAR2017_QC6-5_1.csv"),
    ("V001-09", "Quest QC6-5", "pressure",
     "11f0326ad3e82f1ee5686aeba2d75506817d0387cf8f4bbfa2d5d2f33d208452",
     "Emerald_Streak_9MAR2017_QC6-5_2.csv"),
    ("V001-10", "Quest QC6-5", "pressure",
     "09e271ff2df927a93fd3897e54ef5b7dc65cd9c77abcc7c8f5d73edb138cf0ee",
     "Emerald_Streak_9MAR2017_QC6-5_3.csv"),
    ("V002-01", "AeroTech HP-I140W-14", "gps",
     "0d43f917b3e413797b9307ebb0444a5ae1c6e37b7742d07dfa71bf9390b39748",
     "2023-02-11__TkSpjutVul__20-07-29.csv"),
    ("V002-02", "AeroTech HP-J270W-14", "gps",
     "bf706a9e277df78e041b3fb2ec57ebe356c1486b18649699280088a7e43cd0f0",
     "2023-07-08_DDVulcanite_J270_14-37-34.csv"),
]

# ---- Operational definitions, fixed before outcomes were computed -----------
OP_DEFS = {
    "altitude_channel_pressure": "",
    "altitude_channel_gps": "ALT column (m MSL); AGL = ALT - median(ALT, 5 s before liftoff)",
    "ft_to_m": "x 0.3048 exactly",
    "liftoff": "first sample t_i with t_i <= 10.0 s where some t_j >= t_i + 0.2 s has "
               "(z_j - z_i) > 3.0 m/s * (t_j - t_i)",
    "pad_window": "[liftoff - 5.0 s, liftoff)",
    "pad_median": "median of the altitude samples inside the pad window",
    "running_median": "centred 5-sample median a'[i] = median(a[max(0,i-2) .. min(n-1,i+2)])",
    "apogee_pressure": "max of the centred 5-sample running median of (sample - pad median), in metres AGL; earliest index wins ties",
    "apogee_gps": "max of (ALT - pad median) in metres AGL; earliest index wins ties",
    "E1_gap_threshold_s": 1.0,
    "E2_min_apogee_m": 10.0,
    "E2_min_ascent_s": 1.0,
    "E2_sigma_multiplier": 6.0,
    "E3_ballistic_speed_mps": 20.0,
    "E3_ballistic_below_agl_m": 50.0,
    "E3_impact_agl_m": 5.0,
    "E4_agl_bounds_m": [-100.0, 10000.0],
    "E4_pad_zero_tolerance_m": 10.0,
    "E5_excursion_threshold_m": 50.0,
    "E5_hysteresis_m": 5.0,
    "E6_min_pad_s": 5.0,
    "E6_max_drift_m": 10.0,
    "E9_min_ascent_samples": 10,
    "duplicate_policy_gps": "rows with an identical UNIXTIME are merged; the file's duplicate "
                            "rows were verified to carry identical ALT/FIX/FLAGS, so the first is kept",
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


FLAG_RE = re.compile(r"^b[01]{4}$")


def parse_channel_csv(path):
    """Parse the DOF-PRO channel CSV.

    Layout: 16 channel blocks of (time, value, flag). Trailing empty cells are
    trimmed. A channel with no sample in a row emits its time and value cells
    (empty) but NOT its flag cell, so each absent block occupies 2 cells.
    Verified across all 10 files: zero orphan cells, monotone per-channel time,
    and (ASL - AGL) constant to 0.02 ft on every sample.
    """
    with open(path, newline="") as f:
        rows = list(csv.reader(f))
    header = rows[0]
    nch = len(header) // 3
    names = [header[3 * c + 1] for c in range(nch)]
    series = [[] for _ in range(nch)]
    orphans = 0
    for row in rows[1:]:
        i = 0
        for c in range(nch):
            if (i + 2 < len(row) and num(row[i]) is not None
                    and num(row[i + 1]) is not None and FLAG_RE.match(row[i + 2].strip())):
                series[c].append((float(row[i]), float(row[i + 1])))
                i += 3
            else:
                i += 2
        if i < len(row):
            orphans += 1
    return header, names, series, orphans


def parse_gps_csv(path):
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        seen = {}
        dup_conflicts = 0
        dup_merged = 0
        for x in reader:
            t, alt = num(x["UNIXTIME"]), num(x["ALT"])
            if t is None or alt is None:
                continue
            if t in seen:
                dup_merged += 1
                if abs(seen[t]["alt"] - alt) > 1e-9:
                    dup_conflicts += 1
                continue
            seen[t] = {"t": t, "alt": alt,
                       "fix": int(x["FIX"]), "flags": x["FLAGS"].strip(),
                       "sats": int(x["#SATS"])}
        rows = sorted(seen.values(), key=lambda r: r["t"])
    return fieldnames, rows, dup_merged, dup_conflicts


def find_liftoff(ts, zs, limit_s=10.0):
    for i in range(len(ts)):
        if ts[i] > limit_s:
            break
        for j in range(i + 1, len(ts)):
            dt = ts[j] - ts[i]
            if dt >= 0.2:
                if (zs[j] - zs[i]) / dt > 3.0:
                    return i
                break
    return None


def running_median(vals, k=5):
    half = k // 2
    n = len(vals)
    out = []
    for i in range(n):
        win = vals[max(0, i - half):min(n, i + half + 1)]
        out.append(statistics.median(win))
    return out


def excursions_above(vals, threshold, hysteresis):
    """Count separate excursions above `threshold` using a hysteresis dip."""
    count = 0
    inside = False
    for v in vals:
        if not inside and v > threshold:
            count += 1
            inside = True
        elif inside and v < threshold - hysteresis:
            inside = False
    return count


def evaluate(flight_id, motor, fmt, sha, basename, copy_path, manifest_obj):
    out = {
        "id": flight_id,
        "motor": motor,
        "format": fmt,
        "file_sha256": sha,
        "sealed_path": manifest_obj["evidence_ref"],
        "copy_path": copy_path,
        "manifest_read_state_before": manifest_obj.get("read_state"),
        "manifest_bytes": manifest_obj.get("bytes"),
    }
    if fmt == "pressure":
        header, names, series, orphans = parse_channel_csv(copy_path)
        out["channels"] = names
        out["column_count"] = len(header)
        agl_name = "[Altitude (Baro-Ft-AGL)]"
        asl_name = "[Altitude (Baro-Ft-ASL)]"
        try:
            ci = names.index(agl_name)
            si = names.index(asl_name)
        except ValueError:
            out["status"] = "excluded"
            out["excluded_by"] = ["E4"]
            out["apogee_agl_m"] = None
            out["rule_results"] = {"E4_no_us_usable_altitude_channel":
                                   {"result": "fail", "detail": "barometric altitude channel absent"}}
            return out
        raw = series[ci]                       # (t, ft AGL)
        ts = [t for t, _ in raw]
        zs = [v * FT_TO_M for _, v in raw]     # metres AGL, native (already AGL channel)
        asl_raw = series[si]
        # cross-check: ASL - AGL must be a per-file constant (channel integrity)
        diffs = [b - a for (ta, a), (tb, b) in zip(raw, asl_raw) if abs(ta - tb) < 1e-6]
        out["channels_cross_check"] = {
            "asl_minus_agl_median_ft": round(statistics.median(diffs), 3) if diffs else None,
            "asl_minus_agl_spread_ft": round(max(diffs) - min(diffs), 4) if diffs else None,
            "samples": len(raw),
            "parse_orphan_rows": orphans,
        }
        out["liftoff_s"] = None
        li = find_liftoff(ts, zs)
        rule = {}
        if li is None:
            rule["E7_liftoff_undefined"] = {"result": "fail",
                                            "detail": "no ascent > 3 m/s sustained 0.2 s within the first 10 s"}
            out["status"] = "excluded"
            out["excluded_by"] = ["E7"]
            out["rule_results"] = rule
            out["apogee_agl_m"] = None
            return out
        t_lo = ts[li]
        out["liftoff_s"] = round(t_lo, 3)
        rule["E7_liftoff_undefined"] = {
            "result": "pass",
            "detail": f"liftoff at {t_lo:.3f} s (<= 10 s) from a >3 m/s rise sustained >=0.2 s",
        }
        pad = [(t, z) for t, z in zip(ts, zs) if t_lo - 5.0 <= t < t_lo]
        pad_vals = [z for _, z in pad]
        pad_med = statistics.median(pad_vals) if pad_vals else None
        out["pad_median_m"] = round(pad_med, 4) if pad_med is not None else None
        out["pad_median_reference"] = "m AGL (native channel zero = pad)"
        out["pad_samples"] = len(pad_vals)
        out["pad_window_first_s"] = round(pad[0][0], 3) if pad else None
        # diagnostic: what the available (< 5 s) pad window contains, and apogee
        # sensitivity to using a zero pad reference instead of the pad median.
        out["diagnostics"] = {
            "pad_available_s": round(t_lo - pad[0][0], 3) if pad else 0.0,
            "pad_available_samples": len(pad_vals),
            "pad_available_drift_m": round(max(running_median(pad_vals)) - min(running_median(pad_vals)), 4) if pad_vals else None,
            "apogee_if_pad_zero_m": None,
        }
        # E6 pad reference
        if out["pad_window_first_s"] is None or (t_lo - out["pad_window_first_s"]) < 5.0 - 1e-9:
            rule["E6_pad_reference"] = {
                "result": "fail",
                "detail": f"pad coverage {0.0 if out['pad_window_first_s'] is None else t_lo - out['pad_window_first_s']:.3f} s < 5 s",
            }
        else:
            pad_rm = running_median(pad_vals)
            drift = max(pad_rm) - min(pad_rm)
            out["pad_drift_m"] = round(drift, 4)
            rule["E6_pad_reference"] = {
                "result": "pass" if drift <= 10.0 else "fail",
                "detail": f"{len(pad_vals)} samples over {t_lo - out['pad_window_first_s']:.3f} s; "
                          f"running-median drift {drift:.4f} m (limit 10 m)",
            }
        pad_sigma = statistics.pstdev(pad_vals) if len(pad_vals) > 1 else 0.0
        out["pad_sigma_m"] = round(pad_sigma, 4)
        rel = [z - pad_med for z in zs]
        smooth = running_median(rel)
        api = max(range(len(smooth)), key=lambda i: smooth[i])
        t_ap, ap = ts[api], smooth[api]
        out["apogee_time_s"] = round(t_ap, 3)
        out["apogee_agl_m"] = round(ap, 2)
        out["apogee_raw_max_agl_m"] = round(max(rel), 2)
        out["diagnostics"]["apogee_if_pad_zero_m"] = round(max(running_median(zs)), 2)
        # E1 logger loss
        gaps = [(b - a) for a, b in zip(ts, ts[1:]) if a >= t_lo - 1e-9 and b <= t_ap + 1e-9]
        max_gap = max(gaps) if gaps else None
        post = [(t, z) for t, z in zip(ts, zs) if t > t_ap]
        detail = (f"{len(ts)} baro samples; last sample at {ts[-1]:.3f} s; "
                  f"max sample gap on ascent {0 if max_gap is None else max_gap:.3f} s; "
                  f"{len(post)} samples after apogee")
        e1_ok = orphans == 0 and max_gap is not None and max_gap <= 1.0 and ts[-1] > t_ap
        rule["E1_logger_loss"] = {"result": "pass" if e1_ok else "fail", "detail": detail}
        # E2 CATO
        ascent_s = t_ap - t_lo
        step = max(rel) - 0.0
        e2_ok = ap >= 10.0 and ascent_s >= 1.0 and step > 6.0 * pad_sigma
        rule["E2_cato"] = {
            "result": "pass" if e2_ok else "fail",
            "detail": f"apogee {ap:.2f} m AGL; ascent {ascent_s:.3f} s; "
                      f"step {step:.2f} m vs 6 sigma = {6.0 * pad_sigma:.2f} m",
        }
        # E3 recovery
        impact = [(t, z) for t, z in post if z <= 5.0]
        ballistic = None
        for (t1, z1), (t2, z2) in zip(post, post[1:]):
            if z1 < 50.0 and z2 < 50.0:
                v = (z2 - z1) / (t2 - t1) if t2 > t1 else 0.0
                if v < -20.0:
                    ballistic = (round(t1, 3), round(v, 2))
                    break
        # diagnostic only (the rule verdict stays the literal per-interval test):
        # descent speed of the 5-sample running median below 50 m AGL, and the
        # interval that triggered the literal test.
        sm = list(zip(ts, smooth))
        sm_speeds = []
        for (t1, z1), (t2, z2) in zip(sm, sm[1:]):
            if t1 > t_ap and t2 > t1 and z1 < 50.0 and z2 < 50.0:
                sm_speeds.append(((z2 - z1) / (t2 - t1), t1))
        out["diagnostics"]["e3_literal_trigger"] = ballistic
        out["diagnostics"]["e3_smoothed_speed_min_below_50m_mps"] = (
            round(min(sm_speeds)[0], 2) if sm_speeds else None)
        out["diagnostics"]["e3_smoothed_speed_median_below_50m_mps"] = (
            round(statistics.median(v for v, _ in sm_speeds), 2) if sm_speeds else None)
        # robust physical descent rate: speed over 1 s windows, both ends below 50 m AGL
        one_s = []
        for i in range(len(ts)):
            if ts[i] <= t_ap or zs[i] >= 50.0:
                continue
            for j in range(i + 1, len(ts)):
                if ts[j] - ts[i] >= 1.0:
                    if zs[j] < 50.0:
                        one_s.append((zs[j] - zs[i]) / (ts[j] - ts[i]))
                    break
        out["diagnostics"]["descent_rate_1s_median_below_50m_mps"] = (
            round(statistics.median(one_s), 2) if one_s else None)
        out["diagnostics"]["descent_rate_1s_fastest_below_50m_mps"] = (
            round(min(one_s), 2) if one_s else None)
        e3_ok = bool(impact) and ballistic is None
        rule["E3_recovery"] = {
            "result": "pass" if e3_ok else "fail",
            "detail": (f"impact sample {'yes' if impact else 'NO'} "
                       f"(min post-apogee AGL {min((z for _, z in post), default=float('nan')):.2f} m); "
                       f"below-50 m descent >20 m/s: {ballistic if ballistic else 'none'}"),
        }
        # E4 channel usability
        finite = all(isinstance(v, float) and v == v for v in zs)
        in_bounds = -100.0 <= min(rel) and max(rel) <= 10000.0
        zeroed = abs(pad_med) <= 10.0
        rule["E4_altitude_channel"] = {
            "result": "pass" if (finite and in_bounds and zeroed) else "fail",
            "detail": f"barometric AGL channel present; finite={finite}; "
                      f"pad-relative range [{min(rel):.2f}, {max(rel):.2f}] m; "
                      f"native pad median {pad_med:.3f} m (zero tolerance 10 m)",
        }
        # E5 multiple apogees
        nex = excursions_above(smooth, 50.0, 5.0)
        rule["E5_multiple_apogees"] = {
            "result": "pass" if nex <= 1 else "fail",
            "detail": f"{nex} separate excursion(s) above 50 m AGL (5 m hysteresis)",
        }
        # E8 declared design
        token = basename.replace("Emerald_Streak_9MAR2017_", "").split("_")[0]
        rule["E8_design_mismatch"] = {
            "result": "pass",
            "detail": f"filename motor token '{token}' matches the sealed record's '{motor}'; "
                      "the file header carries channel names only, no contradictory metadata",
        }
        out["rule_results"] = rule
        out["excluded_by"] = [k.split("_")[0] for k, v in rule.items() if v["result"] == "fail"]
        out["status"] = "excluded" if out["excluded_by"] else "usable"
        out["rule_results"]["E9_gps_only_loss"] = {
            "result": "not_applicable",
            "detail": "E9 is scoped to V002 I140W only; this is a pressure-log flight",
        }
        return out

    # ---- GPS-only format ----
    fieldnames, rows, dup_merged, dup_conflicts = parse_gps_csv(copy_path)
    out["channels"] = fieldnames
    out["column_count"] = len(fieldnames)
    out["gps_duplicate_timestamps_merged"] = dup_merged
    out["gps_duplicate_value_conflicts"] = dup_conflicts
    ts0 = [r["t"] for r in rows]
    t_zero = ts0[0]
    ts = [t - t_zero for t in ts0]
    alts = [r["alt"] for r in rows]
    li = find_liftoff(ts, alts)
    rule = {}
    if li is None:
        out["rule_results"] = {"E7_liftoff_undefined": {"result": "fail",
                                                        "detail": "no ascent > 3 m/s sustained 0.2 s within 10 s"}}
        out["status"] = "excluded"
        out["excluded_by"] = ["E7"]
        out["apogee_agl_m"] = None
        return out
    t_lo = ts[li]
    out["liftoff_s"] = round(t_lo, 3)
    pad = [(t, a) for t, a in zip(ts, alts) if t_lo - 5.0 <= t < t_lo]
    pad_med = statistics.median([a for _, a in pad])
    rel = [a - pad_med for a in alts]
    api = max(range(len(rel)), key=lambda i: rel[i])
    t_ap, ap = ts[api], rel[api]
    out["pad_median_m"] = round(pad_med, 3)
    out["pad_median_reference"] = "m MSL (GPS ALT; subtracted to give AGL)"
    out["pad_samples"] = len(pad)
    out["pad_window_first_s"] = round(pad[0][0], 3) if pad else None
    out["diagnostics"] = {
        "pad_available_s": round(t_lo - pad[0][0], 3) if pad else 0.0,
        "pad_available_samples": len(pad),
        "gps_vertical_speed_sources": "VERTV column present but not used for the apogee",
    }
    out["apogee_time_s"] = round(t_ap, 3)
    out["apogee_raw_max_agl_m"] = round(max(rel), 2)
    out["rule_results"] = rule
    rule["E7_liftoff_undefined"] = {"result": "pass",
                                    "detail": f"liftoff at {t_lo:.3f} s from a >3 m/s rise sustained >=0.2 s"}
    # E6
    if not pad or (t_lo - pad[0][0]) < 5.0 - 1e-9:
        rule["E6_pad_reference"] = {"result": "fail",
                                    "detail": f"pad coverage {0.0 if not pad else t_lo - pad[0][0]:.3f} s < 5 s"}
    else:
        pad_rm = running_median([a for _, a in pad])
        drift = max(pad_rm) - min(pad_rm)
        out["pad_drift_m"] = round(drift, 4)
        rule["E6_pad_reference"] = {"result": "pass" if drift <= 10.0 else "fail",
                                    "detail": f"{len(pad)} samples over {t_lo - pad[0][0]:.3f} s; "
                                              f"running-median drift {drift:.4f} m (limit 10 m)"}
    # E1
    gaps = [b - a for a, b in zip(ts, ts[1:]) if a >= t_lo - 1e-9 and b <= t_ap + 1e-9]
    max_gap = max(gaps) if gaps else None
    post = [(t, a) for t, a in zip(ts, rel) if t > t_ap]
    e1_ok = max_gap is not None and max_gap <= 1.0 and ts[-1] > t_ap
    rule["E1_logger_loss"] = {
        "result": "pass" if e1_ok else "fail",
        "detail": f"{len(ts)} unique samples; last at {ts[-1]:.3f} s; max ascent gap "
                  f"{0 if max_gap is None else max_gap:.3f} s; {len(post)} samples after apogee",
    }
    # E2
    ascent_s = t_ap - t_lo
    sigma = statistics.pstdev([a for _, a in pad]) if len(pad) > 1 else 0.0
    out["pad_sigma_m"] = round(sigma, 4)
    e2_ok = ap >= 10.0 and ascent_s >= 1.0 and ap > 6.0 * sigma
    rule["E2_cato"] = {"result": "pass" if e2_ok else "fail",
                       "detail": f"apogee {ap:.2f} m AGL; ascent {ascent_s:.3f} s; "
                                 f"6 sigma = {6.0 * sigma:.2f} m"}
    # E3
    impact = [(t, a) for t, a in post if a <= 5.0]
    ballistic = None
    speeds = []
    for (t1, a1), (t2, a2) in zip(post, post[1:]):
        if t2 > t1:
            speeds.append((t1, (a2 - a1) / (t2 - t1), a1))
    for t1, v, a1 in speeds:
        if a1 < 50.0 and v < -20.0:
            ballistic = (round(t1, 3), round(v, 2))
            break
    rule["E3_recovery"] = {
        "result": "pass" if (impact and ballistic is None) else "fail",
        "detail": (f"impact sample {'yes' if impact else 'NO'}; min post-apogee AGL "
                   f"{min((a for _, a in post), default=float('nan')):.2f} m; "
                   f"below-50 m descent >20 m/s: {ballistic if ballistic else 'none'}"),
    }
    # E4 (applied unless the rule's own exemption names this flight)
    gps_only_exempt = flight_id == "V002-01"
    if gps_only_exempt:
        rule["E4_altitude_channel"] = {
            "result": "exempt",
            "detail": "V002 I140W is the rule's named GPS-only exemption; E9 applies instead",
        }
    else:
        rule["E4_altitude_channel"] = {
            "result": "fail",
            "detail": "no barometric channel in this log; the E4 exemption is written for V002 I140W only",
        }
    # E5
    nex = excursions_above(rel, 50.0, 5.0)
    rule["E5_multiple_apogees"] = {"result": "pass" if nex <= 1 else "fail",
                                   "detail": f"{nex} separate excursion(s) above 50 m AGL (5 m hysteresis)"}
    # E8
    token = basename
    if "J270" in token:
        e8_detail = "filename names J270, matching the sealed record's J270W-14; no in-file motor metadata"
    else:
        e8_detail = ("filename carries date and vehicle only, no motor; the custody manifest and spec "
                     "declare V002/I140W-14 and the log header contradicts nothing")
    rule["E8_design_mismatch"] = {"result": "pass", "detail": e8_detail}
    # E9 (I140W only)
    if gps_only_exempt:
        ascent = [r for r, t in zip(rows, ts) if t_lo - 1e-9 <= t <= t_ap + 1e-9]
        has_fix = all(r["fix"] in (1, 2, 3, 4, 5) for r in ascent) and all(r["flags"] for r in ascent)
        max_is_last = api == len(rel) - 1
        e9_ok = len(ascent) >= 10 and has_fix and not max_is_last
        rule["E9_gps_only_loss"] = {
            "result": "pass" if e9_ok else "fail",
            "detail": f"{len(ascent)} ascent GPS samples (min 10); fix flags present "
                      f"(FIX values {sorted({r['fix'] for r in ascent})}, FLAGS {sorted({r['flags'] for r in ascent})}); "
                      f"maximum is last sample = {max_is_last}",
        }
        out["apogee_agl_m"] = round(ap, 2)
        out["caveat"] = "vertical uncertainty unstated"
        out["extraction_rule"] = "gpsOnly (frozen rules)"
    else:
        rule["E9_gps_only_loss"] = {
            "result": "not_applicable",
            "detail": "E9 is scoped to V002 I140W only",
        }
        out["apogee_agl_m"] = None
        out["diagnostic_gps_max_above_pad_m"] = round(ap, 2)
        out["caveat"] = ("no rule-compliant extraction: the frozen E4 exemption is scoped to V002 I140W, "
                         "so the GPS maximum is reported as a diagnostic only, not as a rule-compliant apogee")
    out["excluded_by"] = [k.split("_")[0] for k, v in rule.items() if v["result"] == "fail"]
    out["status"] = "excluded" if out["excluded_by"] else "usable"
    return out


def main():
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rules_doc = json.load(open(RULES))
    manifest = json.load(open(MANIFEST))
    objects = {o["sha256"]: o for o in manifest["objects"]}
    rules_by_id = {f["id"]: f for f in rules_doc["flights"]}

    results = []
    for fid, motor, fmt, sha, basename in FLIGHTS:
        assert fid in rules_by_id, fid
        obj = objects.get(sha)
        assert obj is not None, f"{fid}: sha not in custody manifest"
        copy_path = os.path.join(COPIES, basename)
        got = sha256(copy_path)
        assert got == sha, f"{fid}: copy hash {got} != manifest {sha}"
        assert os.path.basename(obj["evidence_ref"]) == basename, f"{fid}: filename mismatch"
        assert rules_by_id[fid]["motor"] == motor, f"{fid}: motor mismatch {rules_by_id[fid]['motor']} vs {motor}"
        results.append(evaluate(fid, motor, fmt, sha, basename, copy_path, obj))

    doc = {
        "lane": "BX1",
        "generated_at_utc": generated,
        "rules_source": {"path": RULES, "sha256": sha256(RULES)},
        "custody_manifest": {"path": MANIFEST, "sha256": sha256(MANIFEST),
                             "generated_at_utc": manifest.get("generated_at_utc"),
                             "criteria_version": manifest.get("criteria_version")},
        "blindness": {
            "predictions_read": False,
            "predictions_paths_not_opened": [
                "docs/internal/execution-runs/BL1-blind-predictions/ (PREDICTIONS.json, PREDICTIONS.md)",
                "/home/ak/bl1/",
            ],
            "declaration": "No prediction, BL1 output, or prior outcome was consulted. "
                           "The extractor contains no expected apogee.",
        },
        "files_opened_under_R6_public_cohort": "blind-manifest.json only, plus the 12 listed flight logs "
                                               "(each hashed, then copied once; all work on the copies)",
        "operational_definitions": OP_DEFS,
        "status_legend": {
            "usable": "every applied exclusion rule passed; the apogee is a rule-compliant outcome",
            "excluded": "at least one applied exclusion rule failed; not extractable under the frozen rules. "
                        "The measured apogee is still recorded, but it must not be scored as an outcome.",
        },
        "rule_data_compatibility": {
            "E6_pad_reference": {
                "finding": "No sealed log contains 5 s of pre-liftoff samples. Every file starts at or "
                           "within 3.9 s of ignition, so the frozen E6 test (fewer than 5 s pre-liftoff "
                           "samples) fails for all 12 flights.",
                "pad_coverage_s": {r["id"]: r.get("diagnostics", {}).get("pad_available_s") for r in results},
                "consequence": "Under the rules as written there is no usable blind outcome in V001 or V002. "
                               "This is a rule-versus-data incompatibility, not a defect of the flights.",
                "extractor_action": "E6 was not amended. The measured apogees are reported with the only pad "
                                    "reference the data supports, and the incompatibility is escalated.",
                "owner_decision_required": True,
            },
            "E3_recovery": {
                "finding": "Four V001 flights trip the literal per-interval >20 m/s test on a single 0.05 s "
                           "interval during a ~15 m/s drogue descent (barometric quantum 1.2 ft). "
                           "The same flights' smoothed descent speed stays below the threshold.",
                "literal_trigger": {r["id"]: r.get("diagnostics", {}).get("e3_literal_trigger")
                                    for r in results if r.get("diagnostics", {}).get("e3_literal_trigger")},
                "smoothed_speed_min_below_50m_mps": {
                    r["id"]: r.get("diagnostics", {}).get("e3_smoothed_speed_min_below_50m_mps")
                    for r in results},
                "consequence": "E3 verdicts are reported literally; the artefact is flagged, not overridden.",
                "owner_decision_required": True,
            },
            "E4_V002_02": {
                "finding": "The J270W log is also GPS-only (16 columns, no barometric channel), while the "
                           "frozen E4 exemption names V002 I140W only.",
                "consequence": "V002-02 is excluded under E4 as written; its GPS maximum is reported as a "
                               "diagnostic, not as a rule-compliant apogee.",
            },
        },
        "flights": results,
        "summary": {
            "usable": sum(1 for r in results if r["status"] == "usable"),
            "excluded": sum(1 for r in results if r["status"] == "excluded"),
            "excluded_ids": {r["id"]: r["excluded_by"] for r in results if r["status"] == "excluded"},
        },
    }
    with open(os.path.join(OUT_DIR, "OUTCOMES.json"), "w") as f:
        json.dump(doc, f, indent=1, sort_keys=False)
        f.write("\n")

    # ---- custody read log ----
    opened = []
    times = {}
    for line in open(CUSTODY_COPY_LOG):
        parts = line.split()
        if len(parts) >= 5 and parts[1] in ("ORIG_HASH", "COPY_HASH"):
            times.setdefault(parts[2], []).append((parts[1], parts[0], parts[3], parts[4]))
    for fid, motor, fmt, sha, basename in FLIGHTS:
        obj = objects[sha]
        ev = times.get(fid, [])
        opened.append({
            "flight_id": fid,
            "sealed_path": obj["evidence_ref"],
            "sealed_sha256": sha,
            "sealed_bytes": obj["bytes"],
            "manifest_read_state_before": obj.get("read_state"),
            "manifest_read_bytes": obj.get("read_bytes"),
            "operations": [{"op": "sha256sum (read-only hash of sealed file)", "utc": t, "result": h}
                           for kind, t, _, h in ev if kind == "ORIG_HASH"]
                          + [{"op": "cp to custody copy", "utc": t, "result": h}
                             for kind, t, _, h in ev if kind == "COPY_HASH"],
            "copy_path": os.path.join(COPIES, basename),
            "copy_sha256_verified": sha,
            "work_performed_on": "copy only",
        })
    repo_root = os.path.abspath(os.path.join(OUT_DIR, "..", "..", "..", ".."))
    other = []
    for p in [
        os.path.join(OUT_DIR, "extract_blind_outcomes.py"),
        RULES,
        MANIFEST,
        os.path.join(repo_root, "docs", "internal", "execution-runs", "goal-collegiate-accuracy",
                     "STEP0-BENCHMARK-SPEC.md"),
        os.path.join(repo_root, "docs", "internal", "execution-runs", "goal-collegiate-accuracy",
                     "lanes", "BX1-blind-extraction-ASSIGNMENT.md"),
    ]:
        p = os.path.abspath(p)
        if os.path.exists(p):
            atime = datetime.fromtimestamp(os.stat(p).st_atime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            other.append({"path": p, "sha256": sha256(p), "read": True,
                          "fs_atime_utc": atime,
                          "why": "assignment, frozen rules, custody manifest or sealed-list section"})
    custody = {
        "lane": "BX1",
        "generated_at_utc": generated,
        "policy": "Sealed logs hashed read-only, copied once, then all parsing and analysis ran on the "
                  "copies under step4-blind/outcomes/. No other file under R6-public-cohort was opened.",
        "sealed_manifest": {"path": MANIFEST, "sha256": sha256(MANIFEST)},
        "read_log_note": "Times for the sealed files are taken from the copy-log file at the moment of "
                         "hashing and copying. For other_files_read, fs_atime_utc is filesystem access-time "
                         "metadata and can be stale on relatime/noatime mounts; it is supporting metadata only.",
        "sealed_logs_opened": opened,
        "other_files_read": other,
        "directories_listed_only": [
            "/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/ (names only; no file opened)",
            "/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/outcomes/",
            "/home/ak/.paseo/worktrees/3s8t98rp/bx1-blind-extraction/docs/internal/execution-runs/goal-collegiate-accuracy/",
        ],
        "not_opened_declaration": [
            "R6-public-cohort/S01-dofpro/*.ork (any ORK file)",
            "R6-public-cohort vehicle pages, prose, out-of-cohort vehicles, archives",
            "step4-blind/design/*.xml",
            "step4-blind/motors/*.eng",
            "docs/internal/execution-runs/BL1-blind-predictions/",
            "/home/ak/bl1/",
        ],
    }
    with open(os.path.join(OUT_DIR, "CUSTODY-READ-LOG.json"), "w") as f:
        json.dump(custody, f, indent=1)
        f.write("\n")

    # ---- markdown ----
    lines = []
    lines.append("# BX1 blind outcome extraction\n")
    lines.append(f"Generated {generated}. Rules: `{RULES}` (sha256 `{sha256(RULES)}`), "
                 f"frozen before this lane opened any log. Custody manifest "
                 f"`{MANIFEST}` (sha256 `{sha256(MANIFEST)}`).\n")
    lines.append("Blind: no prediction, BL1 output or prior outcome was read; this extractor "
                 "contains no expected apogee.\n")
    lines.append("## Findings\n")
    lines.append("Under the frozen rules as written, **0 of 12 flights is usable**. The measured "
                 "apogees are reported, but every flight is excluded.\n")
    lines.append("1. **E6 pad reference fails on all 12.** No log carries the 5 s of pre-liftoff "
                 "samples the rule requires; every file starts at or within 3.9 s of ignition. "
                 "Pad coverage per file:\n")
    lines.append("| id | pad coverage s | pad samples | pad median m |")
    lines.append("|---|---|---|---|")
    for r in results:
        dg = r.get("diagnostics", {})
        pm = r.get("pad_median_m")
        lines.append(f"| {r['id']} | {dg.get('pad_available_s')} | {dg.get('pad_available_samples')} | "
                     f"{'' if pm is None else format(pm, '.3f')} |")
    lines.append("")
    lines.append("   This is a rule-versus-data incompatibility, not a flight defect: the logs begin "
                 "at ignition rather than during the pad wait. The measured apogees do not "
                 "depend on it materially (pad medians are within 0.6 m of the channel zero).\n")
    lines.append("2. **E3 recovery trips the literal per-interval test in four V001 files.** The test "
                 "compares two adjacent 0.05 s samples; the barometer reports in 0.37 m steps, so one "
                 "three-step drop inside a single interval reads as 21.9 m/s, and touchdown itself "
                 "produces a pressure jump. The measured 1 s-window descent rates below 50 m AGL are:\n")
    lines.append("| id | literal trigger (t, m/s) | 1 s-window descent median (m/s) | 1 s-window fastest (m/s) |")
    lines.append("|---|---|---|---|")
    for r in results:
        dg = r.get("diagnostics", {})
        tri = dg.get("e3_literal_trigger")
        if not tri:
            continue
        lines.append(f"| {r['id']} | {tri[0]} s, {tri[1]} | {dg.get('descent_rate_1s_median_below_50m_mps')} | "
                     f"{dg.get('descent_rate_1s_fastest_below_50m_mps')} |")
    lines.append("")
    fastest = max((abs(r["diagnostics"]["descent_rate_1s_fastest_below_50m_mps"])
                   for r in results
                   if r.get("diagnostics", {}).get("e3_literal_trigger")
                   and r["diagnostics"].get("descent_rate_1s_fastest_below_50m_mps") is not None),
                  default=None)
    lines.append(f"   None of these flights descends ballistically from altitude; the fastest sustained "
                 f"1 s-window rate in the set is {fastest} m/s (descending). The verdict below is still the "
                 f"literal one, because the frozen rule does not specify a window. Whether the rule means "
                 f"sustained descent is an owner decision, not an extractor edit.\n")
    lines.append("3. **Both V002 logs end airborne** (no impact sample): V002-01 at 1196 m AGL, "
                 "V002-02 at 348 m AGL. E3 excludes both by the missing-impact clause.\n")
    lines.append("4. **V002-02 has no barometric channel either.** The frozen E4 exemption names "
                 "V002 I140W only, so the J270W flight is excluded under E4 as written; its GPS "
                 "maximum is a diagnostic, not an outcome.\n")
    lines.append("No rule was amended after the data were opened. The E6 and E3 questions are "
                 "returned to the owner; the predictions stay frozen and untouched.\n")
    lines.append("## Results\n")
    lines.append("| id | motor | format | liftoff s | pad median m | apogee AGL m | status | excluded by |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in results:
        ap = "n/a" if r["apogee_agl_m"] is None else f"{r['apogee_agl_m']:.2f}"
        if r["apogee_agl_m"] is None and "diagnostic_gps_max_above_pad_m" in r:
            ap = f"n/a (GPS max {r['diagnostic_gps_max_above_pad_m']:.2f}, diagnostic)"
        lo = "" if r.get("liftoff_s") is None else f"{r['liftoff_s']:.3f}"
        padm = "" if r.get("pad_median_m") is None else f"{r['pad_median_m']:.3f}"
        ex = ", ".join(r["excluded_by"]) if r["excluded_by"] else "-"
        lines.append(f"| {r['id']} | {r['motor']} | {r['format']} | {lo} | {padm} | "
                     f"{ap} | {r['status']} | {ex} |")
    lines.append("")
    lines.append("## Rule results\n")
    for r in results:
        lines.append(f"### {r['id']} ({r['motor']}, {r['format']})\n")
        lines.append(f"- sha256 `{r['file_sha256']}`; sealed path `{r['sealed_path']}`")
        lines.append(f"- format: {r['format']}; channels: {', '.join(r['channels'])}")
        lines.append(f"- status: **{r['status']}**"
                     + (f"; excluded by {', '.join(r['excluded_by'])}" if r["excluded_by"] else ""))
        for k, v in r["rule_results"].items():
            lines.append(f"- {k}: **{v['result']}** — {v['detail']}")
        if r.get("diagnostics"):
            lines.append(f"- diagnostics: `{json.dumps(r['diagnostics'], sort_keys=True)}`")
        if r.get("caveat"):
            lines.append(f"- caveat: {r['caveat']}")
        lines.append("")
    lines.append("## Rules as applied (operational definitions, fixed before extraction)\n")
    for k, v in OP_DEFS.items():
        if v:
            lines.append(f"- `{k}`: {v}")
    lines.append("")
    lines.append("## Scope\n")
    lines.append("- Only `blind-manifest.json` and the 12 listed logs were opened under "
                 "`R6-public-cohort/`; no ORK, vehicle page, prose or archive.")
    lines.append("- No engine, app or threshold change; no network.")
    lines.append("- The author cannot self-accept.\n")
    with open(os.path.join(OUT_DIR, "OUTCOMES.md"), "w") as f:
        f.write("\n".join(lines))

    # console summary
    print(f"wrote OUTCOMES.json, OUTCOMES.md, CUSTODY-READ-LOG.json to {OUT_DIR}")
    for r in results:
        ap = r.get("apogee_agl_m")
        diag = r.get("diagnostic_gps_max_above_pad_m")
        print(f"{r['id']:8s} {r['motor']:20s} {r['format']:9s} "
              f"lo={r.get('liftoff_s')} pad={r.get('pad_median_m')} apogee={ap} diag={diag} "
              f"{r['status']} {r['excluded_by']}")


if __name__ == "__main__":
    sys.exit(main())
