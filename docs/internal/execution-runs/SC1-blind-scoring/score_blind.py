#!/usr/bin/env python3
"""SC1 — blind scoring of the BX1 outcomes against the BL1 predictions.

Part 1 is the frozen-rules verdict: 0 of 12 scorable, no score.
Part 2 is a NON-BLIND development comparison under four relaxed rules that are
written and justified from the log structure before any comparison is computed.
Part 3 interprets the result.

Inputs (read-only):
  docs/internal/execution-runs/BL1-blind-predictions/PREDICTIONS.json  (frozen at cbdef58)
  docs/internal/execution-runs/BX1-blind-extraction/OUTCOMES.json      (frozen at c0f473a)
  custodied log copies under <ast-raea-evidence>/goal-collegiate-accuracy/step4-blind/outcomes/

Nothing under R6-public-cohort/ is opened. No engine, app, rule or threshold file
is read for writing. No network.

The pressure parser and the measurement definitions are carried over verbatim
from BX1's extractor so the measurement is the one that was frozen, not a new
one fitted to the predictions.
"""

import argparse
import csv
import hashlib
import json
import os
import re
import statistics
import sys
from datetime import datetime, timezone

RUN_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(RUN_DIR, "..", "..", "..", ".."))
PREDICTIONS_PATH = os.path.join(
    REPO, "docs/internal/execution-runs/BL1-blind-predictions/PREDICTIONS.json")
OUTCOMES_PATH = os.path.join(
    REPO, "docs/internal/execution-runs/BX1-blind-extraction/OUTCOMES.json")
DEFAULT_COPIES = (
    "/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/outcomes")

FT_TO_M = 0.3048
E3_SPEED_MPS = -20.0
E3_BELOW_AGL_M = 50.0
E3_IMPACT_AGL_M = 5.0
E3_WINDOW_S = 1.0

AIRFRAMES = {
    "V001": "Estes Emerald Streak",
    "V002": "LOC DD Vulcanite",
}

FLAG_RE = re.compile(r"^b[01]{4}$")


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


def parse_channel_csv(path):
    """DOF-PRO channel CSV: 16 blocks of (time, value, flag), trailing cells trimmed."""
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
                    and num(row[i + 1]) is not None
                    and FLAG_RE.match(row[i + 2].strip())):
                series[c].append((float(row[i]), float(row[i + 1])))
                i += 3
            else:
                i += 2
        if i < len(row):
            orphans += 1
    return names, series, orphans


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
    return [statistics.median(vals[max(0, i - half):min(n, i + half + 1)])
            for i in range(n)]


def fastest_one_second_descent(ts, zs, t_ap):
    """Most negative dz/dt over >=1.0 s windows fully below 50 m AGL, post apogee.

    For every post-apogee sample below 50 m AGL, take the first later sample at
    least 1.0 s away; if both ends are below 50 m AGL, the pair contributes one
    rate. This is BX1's diagnostic definition, promoted to the relaxed E3 test.
    """
    rates = []
    for i in range(len(ts)):
        if ts[i] <= t_ap or zs[i] >= E3_BELOW_AGL_M:
            continue
        for j in range(i + 1, len(ts)):
            if ts[j] - ts[i] >= E3_WINDOW_S:
                if zs[j] < E3_BELOW_AGL_M:
                    rates.append((zs[j] - zs[i]) / (ts[j] - ts[i]))
                break
    return min(rates) if rates else None


def measure(entry, copies):
    """Recompute the frozen measurement (baro running median / GPS max) plus E3."""
    path = os.path.join(copies, os.path.basename(entry["copy_path"]))
    if not os.path.exists(path):
        raise SystemExit(f"missing custody copy: {path}")
    actual = sha256(path)
    if actual != entry["file_sha256"]:
        raise SystemExit(f"hash mismatch for {entry['id']}: {actual} != {entry['file_sha256']}")

    out = {
        "id": entry["id"],
        "design": entry["id"].split("-")[0],
        "motor": entry["motor"],
        "format": entry["format"],
        "file_sha256": actual,
        "copy_path": path,
    }
    if entry["format"] == "pressure":
        names, series, orphans = parse_channel_csv(path)
        agl_name = "[Altitude (Baro-Ft-AGL)]"
        asl_name = "[Altitude (Baro-Ft-ASL)]"
        ci = names.index(agl_name)
        si = names.index(asl_name)
        raw = series[ci]
        ts = [t for t, _ in raw]
        zs = [v * FT_TO_M for _, v in raw]
        asl = series[si]
        diffs = [b - a for (ta, a), (tb, b) in zip(raw, asl) if abs(ta - tb) < 1e-6]
        out["channel"] = agl_name
        out["asl_minus_agl_ft"] = round(statistics.median(diffs), 3) if diffs else None
        out["last_agl_m"] = round(zs[-1], 2)
        out["samples"] = len(ts)
        out["orphans"] = orphans
        li = find_liftoff(ts, zs)
        if li is None:
            raise SystemExit(f"no liftoff in {entry['id']}")
        t_lo = ts[li]
        # Rule (a): all samples before liftoff; no file has more than 5 s of pad data.
        pad = [(t, z) for t, z in zip(ts, zs) if t < t_lo]
        out["liftoff_s"] = round(t_lo, 3)
        out["pad_samples"] = len(pad)
        out["pad_window_s"] = round(t_lo - pad[0][0], 3) if pad else 0.0
        # Rule (a): median of all pre-liftoff samples if >=3, else the logger's
        # own channel zero (the native AGL channel is zeroed at the pad).
        if len(pad) >= 3:
            pad_ref = statistics.median([z for _, z in pad])
            source = "median of all pre-liftoff samples"
        else:
            pad_ref = 0.0
            source = "logger channel zero (fewer than 3 pre-liftoff samples)"
        out["pad_median_m"] = round(statistics.median([z for _, z in pad]), 4) if pad else None
        out["pad_reference_m"] = round(pad_ref, 4)
        out["pad_reference_source"] = source
        rel = [z - pad_ref for z in zs]
        smooth = running_median(rel)
        api = max(range(len(smooth)), key=lambda i: smooth[i])
        t_ap = ts[api]
        out["measured_agl_m"] = round(smooth[api], 2)
        out["raw_max_agl_m"] = round(max(rel), 2)
        out["apogee_time_s"] = round(t_ap, 3)
        post = [(t, z) for t, z in zip(ts, rel) if t > t_ap]
        out["post_apogee_samples"] = len(post)
        out["impact"] = any(z <= E3_IMPACT_AGL_M for _, z in post)
        rate = fastest_one_second_descent(ts, rel, t_ap)
        out["e3_fastest_1s_mps"] = round(rate, 2) if rate is not None else None
        out["e3_impact_min_agl_m"] = round(min((z for _, z in post), default=float("nan")), 2)
    else:
        # rebuild timestamps from the file (dedup kept in sort order)
        seen = {}
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            for x in reader:
                t, alt = num(x["UNIXTIME"]), num(x["ALT"])
                if t is None or alt is None or t in seen:
                    continue
                seen[t] = alt
        ts0 = sorted(seen)
        ts = [t - ts0[0] for t in ts0]
        alts = [seen[t] for t in ts0]
        out["channel"] = "ALT (m MSL)"
        out["samples"] = len(ts)
        out["last_alt_m"] = round(alts[-1], 2)
        li = find_liftoff(ts, alts)
        if li is None:
            raise SystemExit(f"no liftoff in {entry['id']}")
        t_lo = ts[li]
        # Rule (a): all samples before liftoff.
        pad = [(t, a) for t, a in zip(ts, alts) if t < t_lo]
        out["liftoff_s"] = round(t_lo, 3)
        out["pad_samples"] = len(pad)
        out["pad_window_s"] = round(t_lo - pad[0][0], 3) if pad else 0.0
        if len(pad) >= 3:
            pad_ref = statistics.median([a for _, a in pad])
            source = "median of all pre-liftoff samples"
        else:
            pad_ref = None
            source = "no logger channel zero for GPS; excluded"
        out["pad_median_m"] = round(statistics.median([a for _, a in pad]), 3) if pad else None
        out["pad_reference_m"] = round(pad_ref, 3) if pad_ref is not None else None
        out["pad_reference_source"] = source
        if pad_ref is None:
            out["measured_agl_m"] = None
            out["raw_max_agl_m"] = None
            out["apogee_time_s"] = None
            out["post_apogee_samples"] = None
            out["impact"] = False
            out["e3_fastest_1s_mps"] = None
            out["e3_impact_min_agl_m"] = None
            out["last_agl_m"] = None
            return out
        rel = [a - pad_ref for a in alts]
        api = max(range(len(rel)), key=lambda i: rel[i])
        t_ap = ts[api]
        out["measured_agl_m"] = round(rel[api], 2)
        out["raw_max_agl_m"] = round(max(rel), 2)
        out["apogee_time_s"] = round(t_ap, 3)
        out["raw_max_msl_m"] = round(max(alts), 3)
        out["last_agl_m"] = round(rel[-1], 2)
        post = [(t, z) for t, z in zip(ts, rel) if t > t_ap]
        out["post_apogee_samples"] = len(post)
        out["impact"] = any(z <= E3_IMPACT_AGL_M for _, z in post)
        rate = fastest_one_second_descent(ts, rel, t_ap)
        out["e3_fastest_1s_mps"] = round(rate, 2) if rate is not None else None
        out["e3_impact_min_agl_m"] = round(min((z for _, z in post), default=float("nan")), 2)
    return out


def fmt(x, n=2):
    return "n/a" if x is None else f"{x:.{n}f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--copies", default=DEFAULT_COPIES)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    with open(OUTCOMES_PATH) as f:
        outcomes = json.load(f)
    predictions_by_id = {}  # loaded only after the relaxed rules are written
    flights = {f["id"]: f for f in outcomes["flights"]}
    order = [f["id"] for f in outcomes["flights"]]

    md_path = os.path.join(RUN_DIR, "SCORING.md")
    json_path = os.path.join(RUN_DIR, "SCORING.json")
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ---- Part 1: blind result, and the relaxed rules, written first ----------
    blind_rows = []
    for fid in order:
        e = flights[fid]
        fails = [(k.split("_")[0], v["detail"])
                 for k, v in e["rule_results"].items() if v["result"] == "fail"]
        blind_rows.append((fid, e["motor"], e["format"], e["excluded_by"], fails))

    md = []
    md.append("# SC1 — blind scoring and development comparison\n")
    md.append(
        "Status: **blind result NOT AVAILABLE — 0 of 12 scorable under the frozen rules.**\n")
    md.append(f"Generated {generated}.\n")
    md.append(
        "The predictions were frozen at `cbdef58` "
        "(`docs/internal/execution-runs/BL1-blind-predictions/PREDICTIONS.json`) before any "
        "log was opened; the outcomes were extracted once, blind to the predictions, at "
        "`c0f473a` (`docs/internal/execution-runs/BX1-blind-extraction/OUTCOMES.json`). "
        "STEP0-BENCHMARK-SPEC §6 forbids changing an exclusion or extraction rule after the "
        "opening, so the rules below were not amended. The owner decision of 2026-11-16 "
        "records the blind result as not available and adds the NON-BLIND development "
        "comparison in §2.\n")
    md.append("## 1. Blind result: 0 of 12 scorable under the frozen rules\n")
    md.append(
        "No score is reported in this part. Every flight is excluded by a rule written before "
        "the opening. Exclusions are quoted from `OUTCOMES.json`; they are not recomputed or "
        "reinterpreted here.\n")
    md.append("| flight | motor | format | excluded by | rule detail |")
    md.append("|---|---|---|---|---|")
    for fid, motor, fmtv, excluded_by, fails in blind_rows:
        detail = "<br>".join(f"**{k}**: {d}" for k, d in fails)
        md.append(f"| {fid} | {motor} | {fmtv} | {', '.join(excluded_by)} | {detail} |")
    md.append("")
    md.append(
        "Counts: E6 (pad reference) fails 12 of 12; E3 (recovery) fails 6; E4 (altitude "
        "channel) fails 1 (V002-02). The frozen verdict is **0 usable flights**; the blind "
        "score is therefore **not available**, not zero and not a failure.\n")

    md.append(
        "## 2. NON-BLIND development comparison\n")
    md.append(
        "**Every row in this part is NON-BLIND development data.** It was computed after the "
        "logs were opened, under the four relaxed rules below. It is not a blind result and "
        "must never be reported as one. The relaxation was written and justified from the log "
        "structure before any prediction was compared with any measurement.\n")
    md.append("### 2.1 Relaxed rules (written and justified before the comparison)\n")
    md.append(
        "**(a) Pad reference.** Use the median of all samples before liftoff; if there are "
        "fewer than 3, use the logger's own channel zero.\n"
        "- *Justification (structure only):* every file starts at or within 3.9 s of ignition, "
        "so no file can supply the frozen 5 s pad window; the pre-liftoff spans are 0.05–3.9 s "
        "and carry 1–32 samples. Three samples is the smallest set whose median is not a single "
        "reading, and the pressure logger's AGL channel is already zeroed at the pad (pad "
        "medians are within 0.6 m of zero, and ASL − AGL is constant per file). The channel "
        "zero is the logger's own pad definition, not a value fitted to a result. GPS logs have "
        "no channel zero, so a GPS flight with fewer than 3 pre-liftoff samples would stay "
        "excluded (none does).\n")
    md.append(
        "**(b) E3 ballistic test.** Use a 1 s window instead of adjacent samples.\n"
        "- *Justification (structure only):* the barometric channel samples every 0.05 s and "
        "quantises in 0.37 m steps, so a three-step drop inside one interval reads 21.9 m/s "
        "even though the 1 s median descent rate in those files is only −0.4 to −5.8 m/s; the "
        "same artefact appears in four files. The relaxed test takes, for every post-apogee "
        "sample below 50 m AGL, the first "
        "later sample at least 1.0 s away (20 sample intervals), and fails only if the fastest "
        "such rate is below −20 m/s. The 20 m/s physical threshold is unchanged, the impact "
        "requirement (a sample at or below 5 m AGL) is unchanged, and no file's outcome is "
        "consulted to choose the window.\n")
    md.append(
        "**(c) GPS-only exemption.** Extend the E4 GPS-only exemption to V002-02, carrying the "
        "caveat \"vertical uncertainty unstated\".\n"
        "- *Justification (structure only):* V002-02 has the same 16-column GPS-only layout as "
        "V002-01 (UTCTIME/UNIXTIME/ALT/LAT/LON/#SATS/FIX/HORZV/VERTV/HEAD/FLAGS/…), no "
        "barometric channel, and FIX 3 with a valid fix flag in the pre-liftoff window. The "
        "frozen exemption names only V002-01; the channel structure of the two files is "
        "identical. The caveat is carried "
        "on every V002 row.\n")
    md.append(
        "**(d) No touchdown, no measurement.** A log that ends airborne stays excluded; a "
        "missing touchdown is a real data gap.\n"
        "- *Justification (structure only):* E3 requires an impact sample at or below 5 m AGL. "
        "Both V002 logs end while still descending, with their last samples 1196 m and 348 m "
        "above the pad and VERTV still negative. Rule (b) relaxes only the speed window; it "
        "does not supply a landing, and a file that stops while airborne cannot be "
        "distinguished from a logger or telemetry dropout after apogee. The frozen impact "
        "requirement therefore stands, and both Vulcanite flights remain unscored.\n")
    md.append(
        "No other rule changes. For V001, E1, E2, E4, E5, E7 and E8 already pass; E6 is removed "
        "by (a) and E3 by (b). No rule file, threshold, prediction or outcome was edited.\n")

    preamble = "\n".join(md) + "\n"
    if not args.no_write:
        with open(md_path, "w") as f:
            f.write(preamble)
        print(f"wrote rules + blind result: {md_path}")

    # ---- Now load the predictions and compute -------------------------------
    with open(PREDICTIONS_PATH) as f:
        predictions = json.load(f)
    for p in predictions["flights"]:
        predictions_by_id[p["id"]] = p

    measured = {fid: measure(flights[fid], args.copies) for fid in order}

    dev = []
    for fid in order:
        e = flights[fid]
        m = measured[fid]
        p = predictions_by_id[fid]
        failed_frozen = set(e["excluded_by"])
        remaining = []
        applied = []
        e3_relaxed_ok = (m["impact"] and (m["e3_fastest_1s_mps"] is None
                                          or m["e3_fastest_1s_mps"] >= E3_SPEED_MPS))
        for rule in sorted(failed_frozen):
            if rule == "E6":
                applied.append("E6 removed by (a)")
                continue
            if rule == "E3":
                if e3_relaxed_ok:
                    applied.append("E3 removed by (b)")
                elif not m["impact"]:
                    remaining.append("E3 via rule (d): no impact sample, log ends airborne")
                else:
                    remaining.append(
                        f"E3: fastest 1 s descent {fmt(m['e3_fastest_1s_mps'])} m/s < -20 m/s")
                continue
            if rule == "E4" and fid == "V002-02":
                applied.append("E4 removed by (c)")
                continue
            remaining.append(f"{rule} (not relaxed)")
        if m["pad_reference_m"] is None:
            remaining.append("pad reference unavailable")
        included = not remaining
        nominal = p["nominalApogeeAGL_m"]
        lo, hi = p["interval5to95AGL_m"]
        meas = m["measured_agl_m"]
        err = (nominal - meas) / meas * 100.0 if (included and meas) else None
        dev.append({
            "id": fid,
            "design": m["design"],
            "airframe": AIRFRAMES[m["design"]],
            "motor": m["motor"],
            "format": m["format"],
            "liftoff_s": m["liftoff_s"],
            "pad_samples": m["pad_samples"],
            "pad_window_s": m["pad_window_s"],
            "pad_median_m": m["pad_median_m"],
            "pad_reference_m": m["pad_reference_m"],
            "pad_reference_source": m["pad_reference_source"],
            "measured_agl_m": meas,
            "raw_max_agl_m": m["raw_max_agl_m"],
            "last_agl_m": m["last_agl_m"],
            "impact": m["impact"],
            "e3_fastest_1s_mps": m["e3_fastest_1s_mps"],
            "nominal_m": nominal,
            "interval_m": [lo, hi],
            "signed_error_pct": round(err, 2) if err is not None else None,
            "inside_interval": (bool(lo <= meas <= hi)
                                if (included and meas is not None) else None),
            "included": included,
            "excluded_by_relaxed": remaining,
            "relaxations_applied": applied,
            "caveat": ("vertical uncertainty unstated" if fid == "V002-02" else None),
        })

    included = [d for d in dev if d["included"]]
    if not included:
        raise SystemExit("no flights included after the relaxed rules")

    errs = [d["signed_error_pct"] for d in included]
    abs_errs = [abs(x) for x in errs]
    per_airframe = []
    for design in sorted({d["design"] for d in included}):
        rows = [d for d in included if d["design"] == design]
        es = [d["signed_error_pct"] for d in rows]
        per_airframe.append({
            "design": design,
            "airframe": AIRFRAMES[design],
            "n": len(rows),
            "median_signed_error_pct": round(statistics.median(es), 2),
            "min_signed_error_pct": min(es),
            "max_signed_error_pct": max(es),
            "median_within_10pct": abs(statistics.median(es)) <= 10.0,
            "n_within_10pct": sum(1 for x in es if abs(x) <= 10.0),
        })
    per_motor = []
    for motor in sorted({d["motor"] for d in included}):
        rows = [d for d in included if d["motor"] == motor]
        es = [d["signed_error_pct"] for d in rows]
        per_motor.append({
            "motor": motor,
            "n": len(rows),
            "median_signed_error_pct": round(statistics.median(es), 2),
        })
    mean_abs = statistics.fmean(abs_errs)
    summary = {
        "included_flights": len(included),
        "total_flights": len(dev),
        "per_airframe": per_airframe,
        "per_motor": per_motor,
        "within_10pct": {
            "n_within": sum(1 for x in errs if abs(x) <= 10.0),
            "n": len(errs),
            "vehicle_median_within_10pct": any(a["median_within_10pct"] for a in per_airframe),
            "all_vehicles_median_within_10pct": all(a["median_within_10pct"] for a in per_airframe),
            "pass": all(a["median_within_10pct"] for a in per_airframe),
        },
        "mean_abs_error_pct": round(mean_abs, 2),
        "mean_abs_target_pct": 5.0,
        "mean_abs_pass": mean_abs <= 5.0,
        "interval_coverage": {
            "inside": sum(1 for d in included if d["inside_interval"]),
            "n": len(included),
            "fraction": round(sum(1 for d in included if d["inside_interval"]) / len(included), 3),
            "reference_rule_pct": 80.0,
        },
    }

    # ---- Append the altitude check, the table and the summary ---------------
    md = []
    md.append("### 2.2 Altitude reference check (V002 pad column is MSL; the apogee column is AGL above the pad)\n")
    md.append(
        "The V001 logs carry `[Altitude (Baro-Ft-AGL)]` and `[Altitude (Baro-Ft-ASL)]`; their "
        "AGL channel is already pad-zeroed (ASL − AGL is constant to 0.02 ft per file). The V002 "
        "logs carry one GPS `ALT` column in metres MSL, so the pad median is MSL and the measured "
        "apogee is the difference. The extraction already applied that difference. Rechecking it "
        "from the custody copy:\n")
    md.append("| Mode | flight | raw max ALT (m MSL) | pad median (m MSL) | AGL arithmetic | AGL above pad (m) | extraction value |")
    md.append("|---|---|---|---|---|---|---|")
    for d in dev:
        if d["design"] != "V002":
            continue
        m = measured[d["id"]]
        md.append(
            f"| NON-BLIND | {d['id']} | {fmt(m.get('raw_max_msl_m'), 1)} | "
            f"{fmt(d['pad_median_m'], 1)} | {fmt(m.get('raw_max_msl_m'), 1)} − "
            f"{fmt(d['pad_median_m'], 1)} = {fmt(d['measured_agl_m'], 1)} | "
            f"{fmt(d['measured_agl_m'], 2)} | {fmt(d['measured_agl_m'], 2)} (already AGL) |")
    md.append("")
    md.append(
        "So the apparent mix is a column-label mix, not a value mix: `apogee_agl_m` 3773.00 is "
        "already AGL (6624 − 2851), and 6660.00 is already AGL (9515 − 2855). Subtracting the "
        "pad median a second time would give 922 m and 3805 m, which is the error to avoid. "
        "Both V002 numbers remain unscored: their logs end airborne (rule d), and the vertical "
        "uncertainty is unstated.\n")
    md.append(
        "For V001 the measured AGL is the maximum of the centred 5-sample running median of the "
        "native barometric AGL channel, in metres, as frozen in §6. Rule (a) changes only the pad "
        "reference where fewer than 3 pre-liftoff samples exist (V001-04, V001-07, V001-09 use the "
        "channel zero).\n")

    md.append("### 2.3 Per-flight comparison (NON-BLIND)\n")
    md.append(
        "Signed error = (predicted − measured) / measured × 100. Negative means the prediction "
        "is low. The interval is the frozen qualified 5–95 % interval from `PREDICTIONS.json`.\n")
    md.append(
        "| Mode | flight | airframe | motor | pad samples used | pad reference | pad ref (m) | "
        "measured AGL (m) | predicted nominal (m) | signed error % | 5–95 % interval (m) | inside? |")
    md.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for d in dev:
        if not d["included"]:
            continue
        md.append(
            f"| **NON-BLIND** | {d['id']} | {d['airframe']} | {d['motor']} | {d['pad_samples']} | "
            f"{d['pad_reference_source']} | {fmt(d['pad_reference_m'], 3)} | "
            f"{fmt(d['measured_agl_m'], 2)} | {fmt(d['nominal_m'], 2)} | "
            f"{fmt(d['signed_error_pct'], 2)} | {fmt(d['interval_m'][0], 2)}–"
            f"{fmt(d['interval_m'][1], 2)} | {'yes' if d['inside_interval'] else '**no**'} |")
    md.append("")
    md.append("Flights excluded from the development comparison:\n")
    md.append("| Mode | flight | measured AGL (m) | reason not scored |")
    md.append("|---|---|---|---|")
    for d in dev:
        if d["included"]:
            continue
        reason = "; ".join(d["excluded_by_relaxed"])
        extra = []
        if d["relaxations_applied"]:
            extra.append("applied: " + ", ".join(d["relaxations_applied"]))
        if d["caveat"]:
            extra.append("caveat: " + d["caveat"])
        if extra:
            reason += "<br>" + "<br>".join(extra)
        md.append(f"| **NON-BLIND** | {d['id']} | {fmt(d['measured_agl_m'], 2)} | "
                  f"{reason} |")
    md.append("")
    md.append(
        "For the four V001 flights whose frozen E3 verdict came from one 0.05 s interval, the "
        "relaxed fastest 1 s rates below 50 m AGL are −5.84, −18.56, −12.04 and −11.66 m/s "
        "(V001-01, V001-07, V001-08, V001-10). All four are slower than the unchanged −20 m/s "
        "threshold and all four have an impact sample, so (b) admits them.\n")
    md.append(
        "The V002 measured values are shown for the altitude check only; they are not errors "
        "and are not part of any summary number.\n")

    md.append("### 2.4 Summary on the included flights (spec §6.6)\n")
    md.append(
        f"Included: **{summary['included_flights']} of {summary['total_flights']}** flights, all "
        f"{', '.join(a['airframe'] for a in per_airframe)}, all subsonic.\n")
    md.append("| Mode | metric | result | criterion | verdict |")
    md.append("|---|---|---|---|---|")
    for a in per_airframe:
        md.append(
            f"| **NON-BLIND** | per-airframe median signed error, {a['airframe']} (n={a['n']}) | "
            f"**{fmt(a['median_signed_error_pct'], 2)} %** | ±10 % | "
            f"{'pass' if a['median_within_10pct'] else '**FAIL**'} |")
    md.append(
        f"| **NON-BLIND** | per-vehicle ±10 % test (all included airframes) | "
        f"median signed error "
        f"{', '.join(fmt(a['median_signed_error_pct'], 2) + ' %' for a in per_airframe)} | "
        f"every airframe within ±10 % | "
        f"{'pass' if summary['within_10pct']['pass'] else '**FAIL**'} |")
    md.append(
        f"| **NON-BLIND** | flights within ±10 % | {summary['within_10pct']['n_within']} of "
        f"{summary['within_10pct']['n']} | — | reported |")
    md.append(
        f"| **NON-BLIND** | mean \\|error\\| (mean absolute signed error) | **{fmt(summary['mean_abs_error_pct'], 2)} %** | "
        f"≤ {fmt(summary['mean_abs_target_pct'], 1)} % | "
        f"{'pass' if summary['mean_abs_pass'] else '**FAIL**'} |")
    md.append(
        f"| **NON-BLIND** | interval coverage | "
        f"**{summary['interval_coverage']['inside']} of {summary['interval_coverage']['n']}** "
        f"({fmt(summary['interval_coverage']['fraction'] * 100, 1)} %) | "
        f"80 % reference (P8; reported, not gated here) | 0 % — far below the reference |")
    md.append("")
    md.append("Per-motor medians (context; the prediction is per motor):\n")
    md.append("| Mode | motor | n | median signed error % |")
    md.append("|---|---|---|---|")
    for mrow in per_motor:
        md.append(f"| **NON-BLIND** | {mrow['motor']} | {mrow['n']} | "
                  f"{fmt(mrow['median_signed_error_pct'], 2)} |")
    md.append("")

    # ---- Part 3 -------------------------------------------------------------
    emerald = [a for a in per_airframe if a["design"] == "V001"]
    em = emerald[0] if emerald else None
    md.append("## 3. What it means\n")
    md.append(
        "All 12 flights fly the **legacy** 25-station Mach drag tables. The engine's own "
        "`runManifest.axialDrag` line says so for both designs: the calibrated (built-up) method "
        "refuses the freeform fin planform (\"the calibrated method models trapezoidal fins "
        "only\"). The frozen predictions record the same for every flight "
        "(`PREDICTIONS.json` `dragModel`). None of this comparison therefore tests the new "
        "default drag model; it measures the legacy fallback the app still uses for these two "
        "airframes.\n")
    if em:
        md.append(
            f"On **Emerald Streak** the legacy fallback is **low by a median of "
            f"{fmt(abs(em['median_signed_error_pct']), 1)} %** (signed "
            f"{fmt(em['median_signed_error_pct'], 1)} %, i.e. predicted apogee below measured), "
            f"with a range of {fmt(em['min_signed_error_pct'], 1)} % to "
            f"{fmt(em['max_signed_error_pct'], 1)} % over {em['n']} flights. All "
            f"{em['n']} measurements sit **above** the frozen 5–95 % band, so the band is not "
            f"merely centred wrong: it is entirely below the measured apogees. The direction is "
            f"consistent with an over-draggy legacy table; this comparison alone does not prove "
            f"the cause. The sign holds across four motors (C6-5, C6-7, D13-10W, QC6-5) and a "
            f"2.65× apogee range (201–534 m).\n")
    md.append(
        "On **Vulcanite** no flight is included: both logs end airborne (rule d), so no "
        "Vulcanite error is reported and none is used in the summary. The two measured AGL "
        "apogees (3773 m and 6660 m) are recorded only to check the altitude reference; their "
        "vertical uncertainty is unstated.\n")
    md.append(
        "The blind claim stays **pending**: a blind test of the new default model still needs "
        "logs that satisfy the frozen rules (5 s of pad data, a touchdown, and a barometric "
        "channel, or a GPS-only exemption that names the flight). This development comparison "
        "cannot substitute for it and must not be quoted as one.\n")

    md.append("## 4. Reproduction and scope\n")
    md.append("```")
    md.append("python3 docs/internal/execution-runs/SC1-blind-scoring/score_blind.py")
    md.append("```")
    md.append("")
    md.append(
        "Inputs: `PREDICTIONS.json` at `cbdef58`, `OUTCOMES.json` at `c0f473a`, and the 12 "
        "custody copies under "
        "`/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/outcomes/`; each copy's "
        "sha256 is re-checked against `OUTCOMES.json` before it is parsed. No file under "
        "`R6-public-cohort/` is opened; no network is used. The script writes this file in two "
        "steps: the blind result and the relaxed rules first, the comparison second.\n")
    md.append(
        "No prediction, outcome, rule file, threshold, engine or app source was edited. The "
        "author cannot self-accept.\n")

    if not args.no_write:
        with open(md_path, "a") as f:
            f.write("\n".join(md) + "\n")
        print(f"wrote comparison: {md_path}")

    payload = {
        "lane": "SC1-blind-scoring",
        "generated_at_utc": generated,
        "status": "blind_not_available",
        "blind": True,
        "inputs": {
            "predictions": {"path": "docs/internal/execution-runs/BL1-blind-predictions/PREDICTIONS.json",
                            "sha256": sha256(PREDICTIONS_PATH), "frozen_source": "cbdef58"},
            "outcomes": {"path": "docs/internal/execution-runs/BX1-blind-extraction/OUTCOMES.json",
                         "sha256": sha256(OUTCOMES_PATH), "extraction_source": "c0f473a"},
            "copies_dir": args.copies,
            "copies_hash_checked": True,
        },
        "blind_result": {
            "scorable": 0,
            "total": 12,
            "statement": "0 of 12 scorable under the frozen rules; no score",
            "flights": [
                {"id": fid, "motor": motor, "format": fmtv,
                 "excluded_by": excluded_by,
                 "reasons": {k: d for k, d in fails}}
                for fid, motor, fmtv, excluded_by, fails in blind_rows
            ],
        },
        "development_comparison": {
            "blind": False,
            "label": "NON-BLIND development comparison; not a blind result",
            "relaxed_rules": [
                "(a) pad reference = median of all pre-liftoff samples, or the logger's own channel zero when fewer than 3",
                "(b) E3 ballistic test uses a 1 s window, not adjacent samples",
                "(c) GPS-only E4 exemption extended to V002-02 (vertical uncertainty unstated)",
                "(d) a log that ends airborne stays excluded",
            ],
            "altitude_reference": {
                "V002-01": {"raw_max_msl_m": measured["V002-01"].get("raw_max_msl_m"),
                            "pad_median_msl_m": measured["V002-01"]["pad_median_m"],
                            "agl_m": measured["V002-01"]["measured_agl_m"],
                            "arithmetic": "raw max MSL - pad median MSL"},
                "V002-02": {"raw_max_msl_m": measured["V002-02"].get("raw_max_msl_m"),
                            "pad_median_msl_m": measured["V002-02"]["pad_median_m"],
                            "agl_m": measured["V002-02"]["measured_agl_m"],
                            "arithmetic": "raw max MSL - pad median MSL",
                "note": "the extraction value is already AGL above the pad; do not subtract twice"},
            },
            "flights": dev,
            "summary": summary,
        },
        "interpretation": {
            "drag_model": "legacy 25-station Mach drag tables for all 12 flights; the calibrated method refuses freeform fins",
            "emerald_streak": em,
            "vulcanite_included": [d["id"] for d in included if d["design"] == "V002"],
            "blind_claim": "pending",
        },
        "author": "cannot self-accept",
    }
    if not args.no_write:
        with open(json_path, "w") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        print(f"wrote JSON: {json_path}")

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    sys.exit(main())
