# RMP12 attitude presentation parity — queued diagnosis

ACTIVE (proposal gate), repinned to accepted integration `0f6f08e`. OWNER APPROVAL:
concurrent lanes are authorized; stay in your own worktree/files and keep total
compiler/test work to 2 jobs. Direct OMP
`deepseek/deepseek-flash`, catalog DeepSeek V4.1 Flash 1017 / max, never a
fallback. At most 2 compiler/test jobs overall;
`free -h` before heavy work, stop below 2 GiB. Native OpenAI coordinator owns
independent review/integration.

## Coordinator finding that changes this lane's premise (verified, not assumed)

The retained native/WASM Euler *roundoff* mismatch is real but secondary. The
shipped extraction appears to be mathematically wrong, and the two runtimes agree
only because they share the same formula.

Facts, from the shipped source and independent numeric checks:

- `crates/astraea-core/src/six_dof.rs:152` `quaternion_to_matrix` is the standard
  rotation matrix for `q = (w,x,y,z)`.
- `six_dof.rs:185-198` extracts
  `pitch = asin(2(wx − yz))`,
  `roll  = atan2(2(wy + zx), 1 − 2(x²+y²))`,
  `yaw   = atan2(2(wz + xy), 1 − 2(y²+z²))`.
- Composing a known attitude `q = qz(ψ)·qy(θ)·qx(φ)` and reading those formulas
  back does **not** recover `(φ, θ, ψ)`. Example: input roll 17.19°, pitch 11.46°,
  yaw 28.65° returns roll 18.22°, pitch 9.69°, yaw 28.65°. Yaw is exact; pitch
  and roll are not.
- No interpretation rescues the triple: over 200 random attitudes × 6 axis
  orders × 6 label→axis mappings × 8 sign combinations × {R, Rᵀ} the best
  reconstruction leaves max |ΔR| = 0.572. The printed numbers are therefore not a
  Euler decomposition of the simulated attitude under any standard convention.
- The standard extraction for this quaternion/matrix pair,
  `pitch = asin(2(wy − zx))`, `roll = atan2(2(wx + yz), 1 − 2(x²+y²))`,
  `yaw = atan2(2(wz + xy), 1 − 2(y²+z²))`, recovers the composed angles exactly
  (max error 0 over 3,000 random samples, all three axes non-degenerate).
- The pattern is an exchange between pitch and roll of the extraction *form* and
  its components: the `asin` middle-angle form is applied to the x numerator and
  the `atan2` first-angle form to the y numerator, with the subtracted term's sign
  flipped accordingly. Read against the sim's own axis roles
  (`sim_omega_to_kernel`: x = pitch, y = roll, z = yaw), the consistent extraction
  is `pitch = atan2(2(wx + yz), 1 − 2(x²+y²))`, `roll = asin(2(wy − zx))`,
  yaw unchanged — which is what the numeric recovery above confirms. This is
  consistent with a transcription slip when the formula was ported, not with a
  deliberate convention.
- Because `quaternion_to_euler_deg` feeds the display telemetry
  (`six_dof.rs:2778-2790`), the attitude chart's pitch/roll are affected. Native
  and WASM agree to roundoff because both call the same wrong function, which is
  exactly why the retained parity study could not see it.

The intended axis labels are documented in the TS mirror itself:
`src/sim/sixDofSimulator.ts:280-296` annotates `2(wx - yz)` as "Pitch (around X
axis)" and `2(wy + zx)` as "Roll (around Y longitudinal axis)", and
`sixDofSimulator.ts:1082` maps the simulation rates to kernel
`{x: pitch, y: roll, z: yaw}`. Under that documented intent the correct
extraction is `pitch = atan2(2(wx + yz), 1 - 2(x^2+y^2))`,
`roll = asin(2(wy - zx))`, `yaw` unchanged; the shipped code applies each form
to the other axis and with the other axis' components, contradicting its own
comment. That makes it a transcription defect rather than a presentation idiom,
and the lane must confirm or refute this independently from the matrix, the
composition test and the TS comments - not from this note.

Coordinator method/limits: numeric checks ran in an isolated JS session against
the shipped matrix and formulas; no engine build, no runtime probe, no protected
data. The check is reproducible from the formulas alone and must be re-derived
independently in the lane, not taken on trust.

## Required first deliverable — proposal, no source edit

Confirm route/branch/HEAD. Then, independently:

1. Re-derive the correct extraction from `quaternion_to_matrix` and state the
   exact convention (which body axis carries roll, pitch, yaw; multiplication
   order; intrinsic vs extrinsic), with the composition test that proves it.
2. Decide the display contract: are the three numbers meant to be the physical
   attitude (then the formulas must be corrected), or a legacy presentation idiom
   that must be preserved for byte-identical history (then say so explicitly and
   propose the versioned availability/canonicalisation path instead)? Do not
   propose a tolerance, rounding, or row/fixture special case.
3. Enumerate every consumer: display telemetry, TS oracle, saved telemetry,
   export traces, tests that pin values, and any parity receipt that would be
   invalidated. Old saved runs keep their recorded values; nothing is
   recomputed or rewritten.
4. State the migration: this changes displayed legacy telemetry values, so it is
   a declared reporting migration (report/telemetry version or a documented
   disclosure), not a silent fix. Name the exact version/disclosure change and
   which historical evidence stays valid for which bytes.
5. Specify falsifiers: analytic attitudes per axis, `q`/`−q` equivalence,
   near-gimbal-lock behaviour (asin clamp vs explicit unavailability), and a
   non-vacuous check that a wrong sign or swapped numerator is detected.

## File lease after separate approval

Attitude presentation conversion, its TS mirror, narrowly required consumers,
report/telemetry versioning for the declared migration, and focused regressions.
Read-only: force/moment equations, integrator, state quaternions/events, CP model,
data fixtures, numeric tolerances, the engine dispatch lane
(`flight_provider.rs` is owned by the profile-runtime lane), `src/**` project
schema, package records. Coordinate sequentially with the engine lane; never edit
Rust concurrently.

## Evidence after separate approval

- Analytic recovery per axis, `q`/`−q`, gimbal-lock, and the exact composition
  test above, before and after.
- Native and production-WASM matched requests showing the declared agreement and
  the corrected values, with the invoked-buffer identity recorded.
- Proof that trajectory/quaternions/loads/events are unchanged and that only the
  declared presentation values move; old archives byte-preserved.
- Final affected checks after coherent edits; stop runtimes and remove throwaways
  after evidence capture.
- Small commits, RESULT/EVIDENCE with exact commands/hashes/failures; no
  self-acceptance, no register/manifest/TASKS/handoff edits.

No downloads, data acquisition, outreach, new services, main merge, push, tag,
release, deploy, publication, silent model/default change, relaxed assertion,
manufactured data or historical rewrite.
