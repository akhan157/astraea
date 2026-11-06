# RMP08 equations/rates/geometry/limits — author result

Status: **bounded scope accepted after author-independent coordinator review**.
Computational/equation verification only; no production model, default, DTO,
WASM or release change. RMP08 remains partial; see final review in `REVIEW.md`.

## Identity

- Packet: RMP08-C02, RMP08-C05, RMP08-C06, bounded RMP08-C07 dispositions.
- Branch/worktree: `rmp08-c02-c05-c06-equations` /
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp08-c02-c05-c06-equations`.
- Base: `82c595df544dcdb883ca2fe81274bff7c4664a50`.
- Author source commit: `075af43bc7a7f9f1eb403f8d89c71ed86cff76f8`
  (`test(rmp08): verify equation, rate and geometry-refusal invariants`).
- Records commit: this documentation commit (see `git log`); no push, merge or
  release.
- Routing: OpenRouter `deepseek/deepseek-v4.1-flash-1017`, high effort, one
  serial author. No subagents, no external reviewer, no usage-limit message.

## Delivered

1. **C02 independent equation checks.** The OpenRocket 13.05 technical
   documentation was downloaded and inspected, not merely cited. Its SHA-256
   `cc6fd329…23cf8c` matches the retained-source hash in the P0 review. Printed
   p29 was rasterized to resolve the (3.39) text ambiguity. Added:
   - body interval partition invariance, including the `x0A0` term and a sharp
     cone split;
   - fin reference-length metadata vs area renormalization, and midchord vs
     leading-edge sweep behavior for equal-area tapered/rectangular fins;
   - end-to-end signed cancellation: a closed-area bulge retains negative body
     `J`, negative derivative CP station and signed pitch/yaw moments; changing
     `CA0` does not enter the normal moment;
   - existing transform, translation, pure-couple, reference and CP-policy
     fixtures retained unchanged.
2. **C05 rate semantics.** Documented body order `(pitch,roll,yaw)`, CG velocity
   point, `ω̂=ω Lref/(2V)`, static-subtracted increment, and the inherited
   dimensional pure couple versus source-normalized derivatives. Added exact
   reduced-rate normalization on all three signed axes and an additive
   `aero_moment = static_CG_moment + rate_couple` assertion. Existing signed
   couple, off-axis datum, zero-speed refusal and supplied zero-rate gate were
   reused, not duplicated.
3. **C06 actual adapter refusal.** New test drives the real `FrontendVehicle`
   adapter through multiple fin sets, bad fin count, unknown nose/cross-section/
   transition declarations, fin/body attachment gaps, unsupported component kind
   and non-converged quadrature. It asserts component localization, retained
   `NonConverged` report and byte-identical `serde_json` serialization before and
   after rejection.
4. **C07 dispositions.** `EQUATION-VERIFICATION.md` records bounded per-check
   dispositions, numeric/conditioning policies, retained exclusions and open
   empirical/source/geometry/regime requirements. No fitting, holdout, calibration
   transfer, apogee correction or global PASS.

Production code touched for behavior: none. `flight_provider.rs` gained only the
rate-semantics doc comment and the composition assertion; all other edits are
tests.

## Verification actually run

Native, offline, `-j2`, `CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-rmp08`,
`-- --test-threads=2`, after `free -h` showed 9.2 GiB available:

| Check | Observed |
| --- | --- |
| core `aero_coefficients::tests` | 17 passed, 184 filtered |
| core `flight_provider::tests::signed_rate_couple` | 1 passed |
| core lib full | 201 passed |
| engine `sb1_geometry::tests` | 7 passed, 35 filtered |
| engine lib full | 42 passed |
| throwaway native example (adapter + evaluator + refusal) | `SMOKE PASS`; scaffold deleted |
| independent stdlib Python algebra/numeric checker | 191 checks pass |

Smoke observations: `CD=0.302598773`, `CL=0.146265548`,
`omegaHat=(0.00005,-0.0001,0.00015)`, `rejected_component=Some("second-fins")`,
`input_unchanged=true`. Raw logs and source PDF are in
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-equations-rates/`; they are
inventoried, not committed.

## Independent derivations

Recorded in `EQUATION-VERIFICATION.md`: body `J` by integration by parts and
interval splitting; trapezoid MAC/quarter-chord station equivalence to (3.34);
`(3.37)+(3.39) → (3.40)` including `FD=Aβ/cosΓ`; `Σsin²=n/2`; fin/body factor;
exact wind basis/power; wrench translation; reduced-rate derivative rescaling
`1/(kh²)` after `S→kS, L→hL`.

## Limits and open prerequisites

- No empirical data: physical qualification **unqualified**; dynamic
  qualification **unknown**. Agreement of equations is not flight accuracy.
- Source equations are a published engineering approximation. The source itself
  warns about body lift at a few degrees, roll effects, and quarter-MAC aft
  movement above approximately Mach 0.5. SB1 keeps fixed quarter-MAC and first
  order `α/β`; those remain disclosed discrepancies.
- No source-normalized derivative matrix exists in the implementation; the
  reference-derivative scaling is an independent derivation/open representation
  gap, not a tested provider feature.
- Geometry declarations remain caller assertions; typed-DTO serialization does
  not validate discarded raw JSON, interior profile smoothness, slenderness,
  local radius agreement or real-profile quadrature accuracy.
- No blocking access failure occurred for the OpenRocket PDF. A complete
  independent audit of the original Barrowman thesis and source licensing review
  were not performed (outside this focused lane).
- `Mach<0.8` and `incidence≤5°` remain project computational policy, not measured
  validity; no transonic blend or qualification is implied.

## Review and next action

The author-independent coordinator reviewed source equations and the patch,
independently recomputed the cone partition with exact Fraction arithmetic, and
ran the native smoke executable. Worksheet intermediate fractions were corrected;
the Rust fixture and author checker already used the correct values. The signed
fixture's "cone" comment was corrected to "linear area ramp"; no code behavior
changed. C02/C05/C06 are accepted for the existing bounded computational scope.
C07 remains partial; no empirical/dynamic or transonic qualification is claimed.
MiMo is unavailable (402 funds failure), so the verdict is explicitly the
coordinating GPT review, not MiMo. Integration must rereview RMP02's current
native-source hashes because test blocks changed in two pinned files; original
artifact/source custody and exclusion statuses remain unchanged.
