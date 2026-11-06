# RMP09 C06/C08 independent review — accepted within current model boundaries

Author-independent coordinating GPT review accepts the bounded domain/error
and legacy-preservation scope. Original author review request follows; current
findings, corrections and verification are recorded in the final section.

Review inputs:

- Code commit `67a5f9d73f5af51c49b2c2f87a48a9b4300f544e` (tests/comments only,
  additions only) on base `82c595df544dcdb883ca2fe81274bff7c4664a50`.
- `RESULT.md`, `SOURCE-DOMAIN-LEDGER.md`, `EVIDENCE.json`.
- External logs: `evidence-rmp09-domain-legacy/core-lib-tests.txt`,
  `native-smoke.txt`, `mutation-checks.txt`.

Specific questions for the reviewer:

1. Is the driver/summary-level temporal test sufficient evidence for the C06 rule
   "no earlier unsupported airframe failure hidden by canopy", given that the
   excursion is a real legacy assembly classification (incidence) rather than an
   injected label, and that the 8 m/s case also demonstrates `enveloped == true`
   with `UNKNOWN` from `off_nominal` alone?
2. Does the pair of committed-versus-speculative tests (rejected-trial validity
   never folded; folding stops at the localized root) cover the coordinator's
   concern about speculative stage checks, or is a driver-level rejected-trial
   case still required?
3. Is the canopy Mach boundary assertion (computed Mach exactly `1.0` supported,
   next representable speed refused) the right reading of the retained
   "canopyMach<=1" definition, including the decision to test the computed value
   rather than a nominal speed?
4. Does the C08 sequence test plus the referenced engine dispatch test establish
   "explicit activation only / legacy path unchanged" for the current no-default
   state, without implying any product migration closure?
5. Any condition family in C06 that this lane silently claims but did not
   evidence (terrain datum, profile coverage, recovery physics, zero speed,
   canopy) — the ledger marks unsupported or re-used evidence explicitly.

The original request did not self-assert acceptance. Final coordinator verdict:

## Coordinator review — ACCEPT with recorded corrections

Author: OpenRouter DeepSeek V4.1 Flash 1017; reviewer: coordinating
`openai-codex/gpt-6.1-sol`, a different model family. MiMo is unavailable after
the recorded 402 funds failure, so this is not a MiMo verdict.

Reviewed `82c595d..67a5f9d`, actual cumulative-driver folding and summary
semantics, candidate `compose`/`aero_negligibility`, existing profile/zero-speed
coverage and the public engine dispatch isolation test.

Answers to the five questions:

1. The real-assembly temporal test proves the retained classification survives
   later valid canopy samples. Its extrapolated-only 8 m/s case remains
   enveloped, excluding the alternative explanation that UNKNOWN comes only
   from leaving the free-flight envelope.
2. Rejected-trial positive control plus event-root prefix boundaries test the
   actual folding seams; together with the real driver temporal case they are
   adequate for this existing implementation. No new solver semantics claimed.
3. Inclusive computed canopy Mach 1 and next-speed refusal agree with the
   declared limit. The airframe branch remains independently restricted.
4. Explicit candidate runs remain separate from legacy/native app dispatch.
   Coordinator replaced the Debug-string comparison with stack-array
   `f64::to_bits` comparisons for every summary scalar and event numeric field,
   event text/status equality and empty unrequested-history checks. No formatted
   allocations or debug-representation assumptions remain in that comparison.
   Removed the existing `|| true` tautology from the referenced engine test;
   retained real dispatch refusal and legacy-result-schema assertions.
5. Corrected the domain ledger: incidence/forward-flow checks apply above the
   versioned negligible-force bound; below it, explicit zero-load/no-observation
   approximation status is returned. Mach/profile coverage and zero-speed
   nonzero-rate refusal retain their own precedence. The old "no negligibility
   waiver" wording was inaccurate. Terrain/profile/constant-canopy support and
   absent inflation/shock/multibody models remain explicitly distinguished.

Coordinator ran the existing native smoke executable: legacy zero-wind PASS,
off-nominal crosswinds UNKNOWN after recovery, independent candidate identities,
sonic canopy support versus next-ULP refusal, and zero-speed rest/spin outcomes.
Combined integrated-tree verification: **206 core tests pass; 99 engine tests
pass across 11 suites**, offline, at most two jobs/test threads.
Raw output: external `integrated-native-tests.log`.

ACCEPT C06 for explicit current-model domain/error behavior, not validation of
unsupported terrain/recovery physics. ACCEPT C08 for existing explicit-only
candidate activation and retained legacy results. C07 measured comparison,
physical/dynamic qualification and product default/migration remain open.
No production physical law, threshold, DTO or default changed.
