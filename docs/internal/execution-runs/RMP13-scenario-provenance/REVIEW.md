# RMP13 scenario provenance — proposal gate decision

Reviewer: OpenAI coordinator, independent of the DeepSeek author family.
Lane pin `0f6f08e`; proposal only, no source/build/test/browser action performed.

## Verdict: APPROVED WITH AMENDMENTS — option (a)

Delete the ungrounded module rather than relabel it. The ledger is decisive:
zero runtime references, a second competing default source, and a claim (per-class
±6–10 % "typical" band from a class-independent 6.7 % ceiling, with an assumed
Gaussian family) that no cited source supports. Keeping a relabelled table would
preserve exactly the structure a measured dataset must define later.

Confirmed by coordinator review of the proposal: the sampler really does draw
three independent scalars (wind direction, rail elevation, one uniform thrust
scale), everything else is fixed, and the persisted defaults are 10°/1°/5 % with
seed 20260927. The numerical behaviour therefore cannot change.

## Amendments

1. **No engine build in this lane.** Rust is untouched here, and the integration
   root already produced `13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`
   from current Rust (`pnpm build` at `20725f4`; asset mtime matches). A build in
   this worktree's root would mint a third root-dependent identity for no benefit
   (RMP12 finding). Do the unit/API/emitter work here; the production-CSP browser
   receipt is run by the coordinator in the integration tree after merge, bound to
   `13da44d5…`. Do not cite or invent any other identity.
2. **Wording: `Sample`, not `Empirical`.** `Empirical` invites exactly the
   measured-from-real-flights reading this change removes. Use
   `Sample 50 % radius` / `Sample 90 % radius` / `Sample 99 % radius` and
   `{r.label} of samples within {dist}`.
3. **No internal field names in user-facing copy.** Drop the parentheticals
   `(windAzimuthDegSigma)`, `(railAngleDegSigma)`, `(impulsePctSigma)` from the
   Flight note; name the three inputs in plain words instead. Internal names may
   stay in code comments.
4. **Keep the scenario note short enough to read.** Two paragraphs as proposed is
   acceptable only if the browser proof shows it does not push the summary below
   the fold at 1280×800; otherwise tighten to three sentences plus the fixed-input
   list.
5. **`docs/accuracy.md` sentence: approved**, provided it states only what the
   proposal contains — three independently sampled inputs, everything else fixed,
   not a probability or coverage forecast.
6. **Full suite required**, plus the emitter self-test, because this changes a
   closed inventory; prove no other suite referenced the deleted files. Report the
   exact new test/file counts and the arithmetic.
7. **No new copy tests.** Delete the wording-shaped assertions that fell with the
   module; do not add assertions on the new sentences. Keep every behavioural
   test (unsupported input refusal, sampler independence, ledger counts,
   cancellation) untouched.
8. **Numerical preservation proof must hash the full result**, not just compare a
   few scalars: fixed request, seeds and run range, identical result vector digest
   and identical persisted-sigma defaults before/after.
9. **Disclose the guard change** in the entry: the closed inventory was reduced
   explicitly and the guard stays closed for every remaining suite; historical
   benchmark records and committed evidence hashes are not edited.

## Boundaries reconfirmed

Do not touch Rust, sampler policy/RNG/order, numeric defaults, project schema/IO,
candidate runtime, core physics, protected inputs, the integration
register/manifest/TASKS/handoff, or any historical evidence. The global historical
beta claim is owned by the rights lane (`rmp18-rights-security`); do not edit
`evidenceClaims.ts`, the Workstation banner, `ModelStatusPanel` or `index.html`.

Deliver C1 delete + inventory repair, C2 sampler comments, C3 presentation,
C4 changelog/accuracy sentence, C5 evidence, then stop for coordinator review.
