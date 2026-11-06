# RMP12 attitude display — proposal gate decision

Reviewer: OpenAI coordinator, author-family independent. Pin `0f6f08e`;
proposal only, no source/build/test/browser action.

## Verdict: APPROVED WITH AMENDMENTS — sequence corrected to Z·X·Y

The author re-derived the convention from the only commanded attitude in the
code and corrected a coordinator premise, which the coordinator has now
re-verified independently against `six_dof.rs:2208-2240` and the shipped matrix:

- The initial attitude is the minimal rotation taking body **+Y** onto the rail
  vector (verified: residual 1e-16), so +Y is the longitudinal axis.
- With `R = Rz(yaw)·Rx(pitch)·Ry(roll)` and
  `pitch = asin(2(wx + yz))`, `roll = atan2(2(wy − zx), 1 − 2(x²+y²))`,
  `yaw = atan2(2(wz − xy), 1 − 2(x²+z²))`, the decomposition is exact:
  reconstruction error 2.34e-14 over 3,000 random quaternions and composed-angle
  recovery 2.66e-15.
- The shipped triple reconstructs the attitude under **no** reading (2.0 error as
  a Z·X·Y triple), and at azimuth ≠ 0 it reports `yaw ≈ −2.5°` where the rail
  azimuth demands −30°, with the roll sign flipped. At azimuth 0 the two agree,
  which is why the existing fixtures never caught it.
- The earlier coordinator note that proposed a Z·Y·X "standard" extraction was
  sequence-specific and is superseded; it is corrected in the records.

So: defect confirmed, correction formulas as proposed, and the physical meaning
holds (pitch = rail elevation, yaw = −azimuth, roll = spin about +Y).

## Amendments

1. **Fixture regeneration must be independent.** `telemetry-parity.json` may be
   regenerated only from an implementation that does not call the code under test
   (the retained `derive_attitude.py` path), and the receipt must show the
   old-vs-new per-field deltas and the retained-quaternion recomputation that
   yields zero failing comparisons. Regenerating from the Rust/TS output would
   make the oracle self-fulfilling.
2. **The parity exemption must be scoped, not a waiver.** `telemetry_parity.rs`
   may exempt the Euler fields only with the corrected formulas exercised
   separately at full precision; it must not become "ignore attitude". State
   exactly which fields are compared and at what tolerance afterwards.
3. **Disclosure-only migration approved**, on these conditions: no schema bump;
   the existing `engineIdentity` already records the pre/post boundary; old
   archives byte-preserved and never recomputed; `RESULT.md` must state which
   retained Euler receipts are now historical and that they remain valid for
   their own engine bytes.
4. **Exporting the TS mirror is approved** for shared test vectors; keep it a
   named presentation helper with its comments corrected (they currently claim
   "Pitch (around X axis)" / "Roll (around Y longitudinal axis)" while applying
   the wrong forms — the comments must match the corrected code, not the old
   behaviour).
5. **Gimbal lock and `q`/`−q`:** document the |pitch| = 90 behaviour explicitly
   (which angle becomes indeterminate, what the clamp does) and test both. A
   clamp is acceptable only if the report would not be mistaken for a valid
   three-angle attitude; consider an explicit unavailability marker if the pair
   is genuinely indeterminate.
6. **No UI claim change is in scope.** The lane confirmed no current chart reads
   the triple; do not add charts, do not change the beta claim (rights lane) or
   sampler copy (scenario lane).
7. **Proof:** corrected values from native and production WASM on the same
   request, with the invoked buffer identity recorded, plus a diff proving
   trajectory/quaternions/loads/events are untouched. Rebuild only the artifacts
   this lane's Rust change affects, with unchanged build flags; note that the
   integration tree performs its own build and that byte identity is
   root-dependent.

## Register impact

This is the concrete defect behind RMP12-C02's attitude question. It does not by
itself close C02 (which also needs independent numerical budgets) or C04 (which
needs the post-change matched-runtime receipt); both remain in progress until the
coordinator re-runs the parity evidence on the delivered bytes.
