# RMP07e independent source review — ACCEPT after one focused rework

Reviewer route: fresh ephemeral, no-history, read-only session of the installed
author model (mimo-v2.6-pro, high reasoning; `read` tool only). Independent
authorship reasoning, **not multi-model scientific consensus** and not
qualification. Raw prompt/reviews external-only at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-calibration-binding/`
(`status-review.md` SHA256 `032fc073…`, `status-rereview.md` `2e2ec2be…`).

## Round 1 — REQUEST_CHANGES (3 material issues)

Verified sound: C07 discipline (no green/qualified reads anywhere), engine
attribution epistemically correct for all reachable data, calibration wording
non-stronger than existing surfaces, banner extraction substantively identical,
no behavior change beyond the read-only scope.

1. **New provenance claim not supported by the data:** "Explicitly selected
   supported legacy model." asserts a user action that no-selection legacy
   documents never made. Fixed: "Resolved against the supported legacy model
   contract." — the exact reviewer-suggested alternative.
2. **Engine-attribution states were not actually tested.** Fixed: the four
   sentences extracted into pure `engineAttribution(match, hasRun)` (render path
   and pinned wording cannot drift), all four strings pinned as literals, and a
   seeded render test drives the real run pipeline and asserts branch selection
   and tone for `different`/`unknown`/missing identities. The `same` branch is
   genuinely unreachable through the test stub (test-mode identity is hardcoded
   to a null checksum and `same` requires two equal non-null checksums); the
   limitation is documented in the test and the pure branch pinned instead —
   an honest coverage boundary, verified true by the reviewer.
3. **Claim wording unpinned (tautological test).** Fixed: literal `toBe` pin of
   `BETA_ACCURACY_CLAIM`; any wording change is now a deliberate test edit.

F1 adopted ("different engine identity" wording). F2/F3/F4 consciously left with
reasons (calibration caveat lives in CalibrationCard detail; chip sentence has
own tests; broad ban regexes false-positive on legitimate negation wording).

## Round 2 — ACCEPT

M1–M3 verified closed with genuine (non-tautological) test pinning; the
`same`-branch documentation confirmed honest; no new overclaim. Two non-blocking
one-line strengthenings were adopted after acceptance as reviewer-suggested test
additions: tone assertions for the `unknown` seeds, and an explicit
`not.toContain('Explicitly selected')` / `toContain('Resolved against…')` pin for
M1's wording.

This accepts the read-only status surface only — no new claims, no candidate
status exposure, no qualification language. RMP07-C07 stays in_progress.
