# RMP07a independent review — ACCEPT after focused rework

Author/coordinator: installed OpenAI gpt-6.1-sol/high. Independent reviewer:
separate read-only Codex session using the host's installed OpenAI gpt-6.1-sol,
high effort. Sessions were serial; neither reviewer ran builds, examples, tests,
protected datasets or modifications. This is independent authorship review,
not different-model consensus or independent experimental qualification.

## Initial disposition: REQUEST_CHANGES

1. Default shared serde_json parsing can move difficult finite decimals by one
   ULP on serialized replay. The initial tests replayed Values without a real
   serialize/parse boundary. A preserved binary64 preimage is required.
2. The initial envelope bound model identities but omitted separately versioned
   active aero-negligibility, attitude, prefix, CP and profile-time policies.

## Accepted bounded corrections

- Native-only `replay_report_json` verifies SHA-256, scheme/encoding prefix and
  canonical form; rejects malformed/truncated/nonfinite numbers, duplicate
  preimage keys, excessive nesting and trailing/noncanonical content. It
  reconstructs binary64 from exact bits and integers without f64 conversion,
  then requires the current actual diagnostic to compute the archived digest.
  The decimal display envelope is not the authoritative replay representation.
- Global production JSON parsing/features remain unchanged. Tests now serialize
  and parse reports with the difficult `51.248178375505404` case in both native
  and profile inputs, exercising digest corruption and policy mismatch too.
- Actual active policy versions and the relevant existing numerical thresholds
  are bound in `activePolicies`, including actual profile time observations.

Final independent disposition: **ACCEPT — no material defects found in the
bounded native identity/replay contract.** Optional follow-up: add more rehashed
noncanonical public-entrypoint cases (decoder already has rejection tests).

Acceptance does not establish complete RMP07, numerical/physical qualification,
result equality, executable equality, authenticated origin or production exposure.
Exact runtime binding remains Unknown; external binary hashes are still required.

Raw review artifacts retained outside Git at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-content-identity/`:
- `independent-review.md`: SHA256 `8cb5ed99a0cae466f10fd50e8717f19d4bac04fea6b7fecbc65f2fc2ca792c22`.
- `independent-rereview.md`: SHA256 `60ada65784b500bc47b3f39d4d5b2ea3bc732171a73c45190a67d20278f725a3`.
- Prompts and transcripts are local only; this summary is portable.
