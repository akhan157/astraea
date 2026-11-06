# RMP09a — analytic invariants of the legacy primitive mass/inertia model (RMP09-C01)

Base 822db11. Author omp (anthropic/claude-opus-5-5); serial MiMo no-tools review.
Goal increment 4. Test-only: new `mechanics_invariant_tests` module in
crates/astraea-core/src/six_dof.rs exercising `stage_mechanics` (the shared
assembly). No production/physics/default/WASM change; sealed target-rmp01
binaries untouched (target-rmp10 only). Read-only: mass.rs, models.rs.

Scope: declared vehicle/motor inputs of the legacy model
(`legacy-primitive-mass-inertia/1.0.0`: uniform-cylinder dry body and motor,
impulse-proportional propellant depletion). Measured mass/CG/inertia comparison
is RMP09-C07 and stays open. Permutation here means body-axis ordering
{pitch, roll, yaw}; component-order invariance is not claimed because component
order defines axial stacking (fin anchoring to the last body tube).
