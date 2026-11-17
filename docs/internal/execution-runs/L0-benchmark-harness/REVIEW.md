# L0 review record

| | |
|---|---|
| Lane | L0 benchmark harness (tests-only) |
| Author | codex `gpt-6.1-terra`, medium effort. First attempt in `l0-benchmark-harness` stalled; second attempt in an isolated checkout, branch `l0-benchmark-harness-v2` |
| Independent reviewer | claude-pool `claude-sonnet-5-5`, high effort (different family from the author), read-only, at `fd053c0` |
| Verdict | **ACCEPT WITH FINDINGS**, none blocking |

## Reviewer confirmations (summary)

- Arms A, B and C match spec §2 and the native `absent_options`/`bundle_options`.
- `FlightOptionsDto` is camelCase with `deny_unknown_fields`, so a mistyped option key is
  rejected, not ignored.
- A mutation probe shows that B and C differ from A for the stated reasons.
- The summarizer's regime lists match §3; no tautological comparison.
- Fresh reruns reproduce the outputs byte for byte.
- Scope is 7 added files; no source change. The probe is not in the default vitest set, and
  the Rust test is ignored by default.

## Findings and disposition

| # | Finding | Disposition |
|---|---|---|
| 1 | The WASM hash can be overridden by environment variable; `wasm.json` had no provenance | **Fixed** by the orchestrator: provenance is written, and the summarizer checks the manifest provenance |
| 2 | The summarizer asserted nothing | **Fixed**: input hashes, ≤ 1e-12, and reproduction of the baseline to 1e-9 pp; guard test exits 1 |
| 3 | The probe and summarizer did not create `out/L0` | **Fixed** |
| 4 | Stale RESULT and EVIDENCE lines | Addendum added; author text kept unedited |
| 5 | Deviations from ASSIGNMENT: outputs in an ignored `out/L0` and copied to evidence; missing RESULT sections; log hashes not reproducible | Accepted and recorded. The isolated checkout could not write outside itself |
| 5a | Arm C keeps the vehicle nozzle field | Spec-consistent; stated in the addendum and to be stated in the K3/P3 write-up |

## Reviewer error, verified by the orchestrator

The review says tip removal changes the apogee in "the 11 flights with a nose `tipRadius`".
The manifest (sha256 `3bd28077…`) has **8** entries with a tip radius, all on `nosecone`
components:

qu8k, proteus6, dontdebatethisn5800mindia, kinsel-p4935-a-601-rocket, torrent, rabia,
rabia-shortfincan, blister.

No other component type carries one, so the arm-C removal covers every case. The reviewer's
count is wrong; the code is unaffected.

## Orchestrator acceptance

The lane is accepted as an increment: tests-only harness plus the ⟨L0⟩ baseline numbers. No
author self-accepted.
