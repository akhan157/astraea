#!/usr/bin/env python3
"""Recompute published summary statistics; accepts an already downloaded HTML file.

No network access; does not emit per-flight outcomes. Keep source hash with result.
This is a publication audit, not a simulator or a flight-scoring authority.
"""
import argparse
import hashlib
import html
import json
import re
import statistics
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_html", type=Path)
parser.add_argument("--output", type=Path)
args = parser.parse_args()
source = args.source_html.read_bytes()
rows = []
for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", source.decode(errors="replace"), re.S | re.I):
    cells = [
        re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]*>", " ", value))).strip()
        for value in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)
    ]
    # Reject header, empty/footer and average rows; no hand-selected flight exclusions.
    if (len(cells) == 7 and cells[0] and cells[4].isdigit() and cells[5].isdigit()
            and re.fullmatch(r"-?\d+\.\d+%", cells[6])):
        rows.append(cells)
if not rows:
    raise SystemExit("No valid published flight rows found; inspect source/schema.")
displayed = [float(row[6][:-1]) for row in rows]
recomputed = [100 * (int(row[5]) / int(row[4]) - 1) for row in rows]
result = {
    "source": "https://www.rasaero.com/comparisons-alt.htm",
    "source_sha256": hashlib.sha256(source).hexdigest(),
    "access_date": "2026-10-24",
    "n": len(rows),
    "error_definition": "100 * (predicted_apogee / measured_apogee - 1)",
    "mean_signed_displayed_pct": statistics.mean(displayed),
    "mean_absolute_displayed_pct": statistics.mean(map(abs, displayed)),
    "mean_signed_recomputed_pct": statistics.mean(recomputed),
    "mean_absolute_recomputed_pct": statistics.mean(map(abs, recomputed)),
    "abs_error_lt10_count": sum(abs(x) < 10 for x in displayed),
    "abs_error_lt5_count": sum(abs(x) < 5 for x in displayed),
    "exposed_case_labels": [row[0] for row in rows],
    "limitations": [
        "Developer publication table, not a blind cohort",
        "Repeated vehicle labels are not independent vehicles",
        "Derived averages use per-flight weights",
        "Displayed percentages and integer altitudes are rounded",
        "Some simulations explicitly use postflight adjustments",
    ],
}
rendered = json.dumps(result, indent=2) + "\n"
if args.output:
    args.output.write_text(rendered)
else:
    print(rendered, end="")
