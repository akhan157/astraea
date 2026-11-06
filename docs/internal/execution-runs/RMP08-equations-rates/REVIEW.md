# RMP08 equations/rates/geometry/limits — review status

Original author request retained below. The coordinator's independent review and
current bounded disposition are appended after the request; no empirical
qualification or production activation is implied.

## What requires independent review

1. **C02 equation map.** Confirm the source-symbol map and the zero-angle
   reduction of (3.18)/(3.24)/(3.25), including the lower-station `x0A0` term in
   `J`, the (3.34) station identity, and the independent reduction of
   (3.37)+(3.39) to (3.40) with `FD=Aβ/cosΓ`. Verify that the midchord sweep
   `cosΓ=s/hypot(s,m+(ct-cr)/2)` is not a leading-edge relabel.
2. **Signed/cancellation behavior.** Check that negative `J`, cancelling `C`,
   null CP and `K=J-xG C` are represented without a hidden positivity/CP guard,
   and that the new evaluator fixture is a physically meaningful algebra case
   rather than an accidental configuration.
3. **C05 rate definitions.** Check the body order `(pitch,roll,yaw)`, CG velocity
   point, reduced-rate normalization `ωLref/(2V)`, static-subtracted increment,
   and the explicit separation of the inherited dimensional pure couple from a
   source-normalized derivative matrix (including the derived `1/(kh²)`
   renormalization, which is not implemented).
4. **C06 refusal behavior.** Check that the new test exercises the real typed DTO
   adapter and that serialization equality plus component localization are
   adequate consumer-visible evidence, without overstating raw-source validation.
5. **C07 dispositions.** Confirm that bounded computational results are not
   presented as empirical qualification, and that all excluded regimes and open
   prerequisites remain visible.

## Suggested independent boundary recheck

Pick at least one, using the worksheet identities rather than the author tests:

- Recompute a split body interval with and without the `x0A0` term and explain
  why only one form is translation/additivity consistent.
- Re-derive (3.40) from (3.37)–(3.39) using the rendered p29 equation; confirm
  `β=0.8` is not a special case.
- Numerically integrate `2∫x A'(x)dx` for the closed bulge and compare with
  `2(x1A1-x0A0-∫A)`.

## Evidence to inspect

- `ASSIGNMENT.md` (lease written before edits).
- `EQUATION-VERIFICATION.md` (source map, derivations, dispositions, commands).
- `EVIDENCE.json` (hashes, checks, failures, remaining scope).
- Source commit `075af43bc7a7f9f1eb403f8d89c71ed86cff76f8`.
- Raw logs and source PDF in
  `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-equations-rates/`.

## Known author limitations

The independent checker was written by the same author as the code tests. It
uses different arithmetic (stdlib Decimal/Fraction, numerical quadrature) and
the source equations directly, but it is not an independent reviewer. The
OpenRocket PDF was inspected; the original Barrowman thesis and source licensing
were not audited here. No empirical comparison was performed.

## Author-independent coordinator review — ACCEPT with recorded corrections

Author: OpenRouter DeepSeek V4.1 Flash 1017. Reviewer: coordinating
`openai-codex/gpt-6.1-sol`, a different model family. MiMo is unavailable after
the recorded 402 funds failure; this is a coordinator verdict, not MiMo output.

Inspected source diff `82c595d..075af43`, worksheet, independent checker,
native-smoke log, source body equations (3.18)/(3.24)/(3.25), and rendered source
printed p29 equations (3.38)-(3.40). The rendered denominator confirms
`FD=A*beta/cosGamma`; the zero-angle SB1 reduction and midchord convention agree.
No runtime aerodynamic law changed; added assertions cover signed behavior,
partition additivity, reduced-rate normalization and actual adapter refusal.

Independent boundary check: exact Fraction arithmetic gives front
`(C,J)=(8/9,16/27)`, rear `(64/9,416/27)`, total `(8,16)` for
`A=4*x²/9`, `S=1`, split at x=1. The worksheet had incorrect intermediate
fractions, although the Rust test and author checker were already correct.
Coordinator corrected those fractions, the fixture's misleading "cone" label
(its area is a linear ramp), the conflated sweep/station explanation and the
unsupported phrase "measured discrepancy". Evidence:
external `coordinator-partition-check.json`.

Coordinator also executed the existing native smoke executable: SMOKE PASS,
`CD=0.302598773`, `CL=0.146265548`, reduced rates
`(0.00005,-0.0001,0.00015)`, second-fins refusal, input unchanged.
Author-run core 201/engine 42 tests and 191 algebra checks are recorded evidence,
not claimed as fresh coordinator test runs.

ACCEPT for the existing bounded SB1 equation verification (C02), explicitly
selected inherited dimensional-rate semantics (C05) and typed geometry
refusal/non-mutation (C06). No source-normalized derivative matrix is implemented
or approved by this verdict. C07 remains partial: development comparisons and
numeric budgets remain open. C01/C03/C04/C08, transonic support, empirical and
dynamic qualification are not closed. RMP08 stays partial.

Integration prerequisite: RMP02's native-boundary pins include the two files
whose test blocks changed. Review confirms runtime equations/adapter branches
are unchanged; coordinator may refresh only those current native-source pins
after integration, preserving original source/artifact custody and all exclusion
statuses. Record and exercise that rereview; do not suppress the custody gate.
