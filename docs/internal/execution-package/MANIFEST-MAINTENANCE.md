# Maintaining the execution package during future work

The package manifest covers documents, briefs, templates, index/register, helper
and WIP patch. Its accepted-source hashes are a historical snapshot, not a rule
that later legitimate code changes must be reverted. Default validation checks
package structure/links/hashes; `--snapshot` additionally compares that historical
code subset. A snapshot difference after implementation is expected and recorded.

When a reviewed packet changes tracker/evidence/brief details:

1. Save actual implementation/check/review records first. A register PASS requires
   source SHA, evidence location and approved disposition; N/A requires reviewed
   scope reason. Missing data stays blocked/not_run, not pass.
2. Update only affected package/tracker entries; preserve original accepted-source
   identities and WIP provenance. Record changed interface/dependency decisions.
3. Review the package diff, then refresh `packageFilesSha256` in manifest.json for
   current package files, excluding manifest.json and __pycache__. Do not reset
   acceptedSourceSha256 to make a failed snapshot check look successful.
4. Re-run the validator and whitespace/link checks. Save the package validation
   result separately from engineering/scientific evidence. Keep commits local
   unless the owner separately authorizes engineering pushes.

A coordinator can refresh the file inventory with this standard-library snippet
from the repository root after the documented review:

```python
from pathlib import Path
import hashlib, json
folder = Path('docs/internal/execution-package')
path = folder / 'manifest.json'
record = json.loads(path.read_text())
record['packageFilesSha256'] = {
    str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted(folder.rglob('*'))
    if p.is_file() and p != path and '__pycache__' not in p.parts
}
path.write_text(json.dumps(record, indent=2) + '\n')
```

This validates bookkeeping, not evidence truth. The coordinator/scientific/owner
reviews required by each gate still apply. Do not treat an editable checksum file
as a security signature or automatic release approval.
