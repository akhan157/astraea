#!/usr/bin/env python3
"""Hash candidate flight files and inspect only their CSV headers.

Usage: python3 -I scripts/round2/audit_outcome_headers.py <flightdata-dir>

This stage intentionally does not read telemetry rows. It emits hashes, the
first CSV record, and whether that schema can identify an eligible channel
under the frozen round-2 protocol.
"""
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

FILES = {
    "bella-lui": ["rockets_EPFL_Bella_Lui_bella_lui_flight_data_filtered.csv"],
    "andromeda": ["rockets_andromeda_flight_data.csv"],
    "astra": ["rockets_astra_flight_data.csv"],
    "cavour": ["rockets_polito_altimeter_cavour.csv"],
    "erebus-11": ["rockets_erebus11_flight_data_filtered.csv"],
    "genesis": ["rockets_genesis_flight_data_faraday.csv", "rockets_genesis_gnss_faraday.csv"],
    "lince": ["rockets_lince_main_data.csv"],
    "juno-iii": [
        "rockets_juno3_cots_GNSS.csv",
        "rockets_juno3_cots_altimeter.csv",
        "rockets_juno3_srad_telemetry.csv",
    ],
    "prometheus": [
        "rockets_prometheus_2022-06-24-serial-5115-flight-0001-TeleMetrum.csv",
        "rockets_prometheus_2022-06-24-serial-6583-flight-0003-TeleMega.csv",
    ],
    "valkyrie": ["rockets_valkyrie_flightInfo_merged.csv"],
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def schema_status(header: list[str]) -> str:
    normalized = [re.sub(r"[^a-z0-9]+", "", h.lower()) for h in header]
    units = re.compile(r"\b(?:m|meter|meters|ft|feet|hpa|pa|kpa)\b", re.I)
    direct = [h for h in header if re.search(r"agl", h, re.I) and not re.search(r"filtered|fused", h, re.I)]
    if direct and all(units.search(h) for h in direct):
        return "eligible AGL label and units in header"
    pressure = [h for h in header if re.search(r"pressure", h, re.I)]
    pressure_with_units = [h for h in pressure if units.search(h)]
    if pressure_with_units:
        return "eligible raw pressure channel and units in header"
    gnss_alt = [h for h in header if re.search(r"gnss.*(?:alt|elev)|(?:alt|elev).*gnss", h, re.I)]
    if gnss_alt and all(units.search(h) for h in gnss_alt):
        return "eligible GNSS altitude channel and units in header"
    candidates = [h for h in header if re.search(r"(?:alt|elev|height|\bz\b|pressure)", h, re.I)]
    if candidates:
        return "unscorable: channel reference, sensor type, or units are ambiguous from header"
    return "unscorable: no altitude or pressure channel in header"


def main(root: str) -> None:
    base = Path(root)
    result = []
    for vehicle, names in FILES.items():
        for name in names:
            path = base / name
            with path.open(encoding="utf-8-sig", newline="") as stream:
                header = next(csv.reader(stream))
            result.append({
                "vehicle": vehicle,
                "file": name,
                "sha256": sha256(path),
                "header": header,
                "status": schema_status(header),
            })
    print(json.dumps({"sampleRowsRead": 0, "files": result}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
