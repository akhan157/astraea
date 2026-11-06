# Artifact availability and source recovery

## In the migration Git branches

Accepted source, full roadmap/tracker, accepted contracts/method/review documents,
synthetic fixtures/checkers and portable coordination snapshots are in
`delivery/integration-20261024`. The incomplete two-file candidate source patch
is also packaged at `wip/candidate-flight.patch`; original WIP commit/branch is
retained separately. Package source manifest verifies these records without a
build or external-machine assumption.

`docs/internal/session-handoff/evidence-records/` contains selected original
verification JSON/source/binary hashes, not every referenced raw artifact.
Historical source/tree identity can be inspected through Git even when a binary
or old workspace no longer exists. Use evidence as historical results at its
recorded source, not fresh verification of a new device.

## Not automatically in a new checkout

Old `/workspace/astraea-plan`, raw test logs, local compiled binaries, dist,
node_modules, Cargo/Rust/Pnpm caches, pinned Docker images, third-party reference
PDFs and ephemeral fixture private keys. Do not infer availability from a hash
or restore a guessed file. Never migrate private signing keys/credentials or
protected raw outcome data into Git to make a test convenient.

Original known source identities include the retained OpenRocket13.05 techdoc
and NASA D4013 document; hashes/URLs/source-specific qualifications are in accepted
P0/A1b/D1 records. If a needed retained reference is unavailable, recover that
already-identified source from a lawful permitted location and verify its expected
hash, or mark it unavailable. This is source recovery, not a new broad source
search or permission to open new flight outcomes. Do not claim a changed upstream
PDF is the same artifact when its bytes differ. Rights/exposure records control.

## Availability ledger to write at dispatch

For each required artifact: ID, kind (source/input/synthetic/reference/scoring/
secret/tool/binary/log), original path/URL, expected hash, rights/access status,
local location and verification, source/data exposure class and permitted use.
Possible states: available_verified, available_unverified, historical_record_only,
missing, access_required, sealed_do_not_open. Hashes for sealed data may be supplied
by custodian; do not read the file to compute one without authorized access.

Dependencies that block only a physical claim do not stop unrelated implementation.
A missing source export cannot be fabricated from its manual screenshot. A missing
old binary does not require rebuilding the old workspace before every task; use
current reviewed source and relevant checks, with honest original/new-source labels.
If exact old reproduction is itself necessary, scope it as a separate evidence
recovery question rather than count an approximate rebuild as the original binary.
