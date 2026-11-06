#!/usr/bin/env python3
"""Saved-output-only sign witness. No engine, browser, new solve or mutable output.
Usage: python3 analyze-signed-zero.py /retained/browser-8 > /new/witness.json
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import zipfile

root = Path(sys.argv[1])
names = ['before-reload-worker-observations.json', 'variant-project.json',
         'variant-trace.json', 'variant-export.zip', 'metrics.json']
raw = {name: (root / name).read_bytes() for name in names}
project = json.loads(raw['variant-project.json'])
case = project['cases'][-1]
history = case['momentArmHistory']
observed = json.loads(raw['before-reload-worker-observations.json'])
matching = [r for r in observed['replies'] if r.get('history') == history]
assert len(matching) == 1, 'Need unique actual worker result for variant'
trace = json.loads(raw['variant-trace.json'])
with zipfile.ZipFile(io.BytesIO(raw['variant-export.zip'])) as archive:
    project_names = [n for n in archive.namelist() if n.endswith('.astraea.json')]
    trace_names = [n for n in archive.namelist() if n.endswith('.trace.json')]
    assert len(project_names) == len(trace_names) == 1
    zipped_project = json.loads(archive.read(project_names[0]))
    zipped_trace = json.loads(archive.read(trace_names[0]))
zipped_case = next(c for c in zipped_project['cases'] if c['id'] == case['id'])
metrics = json.loads(raw['metrics.json'])
assert case['engineIdentity']['sha256'] == metrics['wasmSha256']
assert trace['simulation']['engineIdentity'] == case['engineIdentity']
assert zipped_trace['simulation']['engineIdentity'] == case['engineIdentity']
path = ['points', 0, 'dampingMomentBodyNm', 'x']
def sign_bits(h):
    value = h
    for key in path:
        value = value[key]
    return struct.pack('>d', value).hex()
carriers = {
    'actualWorkerReply': matching[0]['history'],
    'savedVariantProject': history,
    'inspectorTrace': trace['simulation']['momentArmHistory'],
    'downloadedZipProject': zipped_case['momentArmHistory'],
    'downloadedZipTrace': zipped_trace['simulation']['momentArmHistory'],
}
bits = {name: sign_bits(h) for name, h in carriers.items()}
assert all(value == '8000000000000000' for value in bits.values()), bits
print(json.dumps({
    'status': 'pass',
    'scope': 'saved-output-only negative-zero retention witness, not physical qualification or new solve',
    'caseId': case['id'], 'engineIdentity': case['engineIdentity'],
    'historyFieldPath': 'points[0].dampingMomentBodyNm.x',
    'binary64BigEndianHex': bits,
    'inputSha256': {name: hashlib.sha256(data).hexdigest() for name, data in raw.items()},
}, indent=2))
