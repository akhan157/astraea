"""Blind-by-procedure notebook stripper for the round-2 flight validation.

Usage: python3 -I strip_notebook.py <in.ipynb> <out.py> [salvage-cell-index ...]

Keeps only code-cell sources. Discards every output and every markdown cell
without reading them. Drops (a) whole code cells that look like they load or
compare flight data, matched by keyword, and (b) single lines that mention
results (apogee other than a parachute trigger, measured, actual). Cells named as
"salvage" are filtered line by line (keyword lines dropped) instead of being dropped whole,
for cells that mix input definitions with a flight-data keyword. The output
file lists which cells/lines were dropped and the matching keyword, never
their content.
"""
import json
import re
import sys

CELL_DROP = re.compile(
    r"flight_?data|flight[_ ]?csv|measured|telemetry|altimeter|stratologger|eggtimer|"
    r"raven|perfectflite|read_csv|loadtxt|genfromtxt|\.compare|comparison|experimental|"
    r"real[_ ]?(flight|data|apogee|trajectory)|apogee_?(real|meas|exp)|kalman|\bgps\b|"
    r"\.csv.*(flight|alt|baro)|(flight|alt|baro).*\.csv|ground[_ ]?truth|\.plots\.compare",
    re.I,
)
LINE_DROP = re.compile(r"apogee|measured|actual", re.I)


def main(src: str, dst: str, salvage: set) -> None:
    nb = json.load(open(src, encoding="utf-8"))
    out = []
    dropped_cells = []
    dropped_lines = 0
    code_idx = 0
    for cell in nb["cells"]:
        if cell.get("cell_type") != "code":
            continue
        code_idx += 1
        text = "".join(cell.get("source", []))
        m = CELL_DROP.search(text)
        if m and code_idx not in salvage:
            dropped_cells.append((code_idx, m.group(0).lower()))
            continue
        kept = []
        for line in text.splitlines():
            if m and CELL_DROP.search(line):
                dropped_lines += 1
                continue
            if LINE_DROP.search(line) and "trigger" not in line.lower():
                dropped_lines += 1
                continue
            kept.append(line)
        out.append(f"# ---- code cell {code_idx} ----\n" + "\n".join(kept) + "\n")
    header = (
        f"# STRIPPED: source={src}\n"
        f"# code cells kept: {len(out)}; dropped cells: "
        f"{[(i, k) for i, k in dropped_cells]}; dropped lines: {dropped_lines}\n\n"
    )
    open(dst, "w", encoding="utf-8").write(header + "\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], {int(x) for x in sys.argv[3:]})
