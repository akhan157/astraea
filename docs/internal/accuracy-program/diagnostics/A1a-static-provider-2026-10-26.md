# A1a unused static SB1 foundation — 2026-10-26

Subsequent coordinator implementation review and integrated checks are recorded
in the [foundation reconciliation](../sb1-foundation-2026-10-26/README.md).

Status: **implemented candidate mathematics; unused by production; empirically
unqualified; independent implementation review pending**. Base commit:
`f07f0fb21886e639730f12765b25c0ef90d339bd`. This packet implements only the bounded
static foundation of the accepted P0 contract. It does not complete A1 integration.

## Scope and source provenance

The only runtime-source edits are a new `astraea-core::aero_coefficients` module
and its `pub mod` declaration. No aerodynamic dispatch, existing force assembly,
legacy CNa/CP guard, model preparation, serialization, frontend, calibration,
default provider or saved-project behavior changes. No flight simulations,
development-flight comparisons, holdout reads, production activation or push
were performed.

The independently written equations follow accepted
[`P0-contract.md`](../first-batch-2026-10-26/P0-contract.md) §§1–5 and the source
verification in [`P0-independent-review.md`](../first-batch-2026-10-26/P0-independent-review.md).
Public engineering source: OpenRocket 13.05 technical documentation,
<https://openrocket.sourceforge.net/techdoc.pdf>, retained source SHA-256
`cc6fd3291ade76ee044ffd40ff285cf814c7496b97d1ff7b35222d8f2d23cf8c`.
No source engine implementation was copied or consulted for this module.

| Implementation | Source and symbol map |
| --- | --- |
| Body `C=2(A1-A0)/S`, `J=2(x1*A1-x0*A0-integral A dx)/S` | (3.18), (3.24), (3.25), pp22–23, zero-angle derivatives; source Aref → S, moment reference d → L; local interval promoted to global nose stations |
| Trapezoidal station | (3.30)–(3.34), p26; Cr → root chord, Ct → tip chord, Xt → tip-leading-edge sweep m, add root-LE station |
| Single-fin slope | (3.40), p29; source s is exposed root-to-tip semispan, Afin is one fin's one-sided area, Aref → S; compressibility beta → sqrt(1-Mach²), distinct from sideslip |
| Midchord sweep | `cosGamma=s/hypot(s,m+(ct-cr)/2)`; root and tip chord midpoints, not leading-edge sweep |
| Fin-set multiplier | (3.53), p32, n/2 for 3 or 4 equally spaced fins; (3.55)–(3.56), p34, `1+r_t/(s+r_t)`; no extra induced-body term |
| Wind transform and wrench translation | P0 §§2–3, exact right-handed +Y-forward basis and full datum vector |

Fixed quarter-MAC over the entire candidate Mach interval is deliberate SB1
policy. Source p27 describes aft station motion beginning around Mach 0.5; that
motion is omitted here. The finite-angle continuation is first order in alpha
and beta, not a finite-angle sine-law implementation. Viscous body lift,
roll-angle effects, interacting fin sets, cant and dynamic prediction remain
outside this module's model.

## API and explicit meanings

`Vec3`, `References`, and `Datum` distinguish body vectors, declared SI
normalization and full position relative to the nose. `flow_angles` returns
`None` at V0. `WindBasis` implements exact transforms independently of the
restricted SB1 domain. `CoefficientWrench` carries independent total CF and CM,
supports arbitrary datum translation, dimensionalization and re-referencing.
Pure couples remain possible in this general wrench API and are invariant under
translation; SB1 does not invent a cant/free-couple model.

`NormalContribution`/`NormalSums` retain signed C, J, sum-absolute C and J.
`derivative_cp` is a diagnostic at the symmetric zero-incidence baseline,
including kappa_C and optional C uncertainty interval. No positive-slope or
small-denominator force guard exists. A zero denominator or nonfinite ratio has
no station. An uncertainty interval containing zero makes the station
unresolved while preserving finite-denominator conditioning. A finite ratio
without uncertainty evidence remains unqualified; it does not declare stability
or numerical accuracy. Root implementation review added the separately named
numerical presentation policy `cp-ratio-roundoff-cancellation/1.0.0`: when
`abs(C)/sum(abs(Ci)) <= 64*f64::EPSILON`, the station is null with
`NumericallyIllConditioned`, retaining C, J, kappa and all wrenches unchanged.
This is a relative roundoff/cancellation display bound, not an absolute C floor,
model-domain rule or physical tolerance; a tiny isolated C still yields a ratio.
P0 itself did not prescribe this cutoff; the additional policy is explicit and
versioned for independent review. Public `NormalSums` consumers reject nonfinite
values and absolute sums that do not bound the signed sums.
The explicit `coefficient_limit` API can query zero-angle
limits without pretending zero-speed flow angles exist.

`evaluate_static` accepts a prescribed, identified CA0 (`PrescribedAxial`). It
does not call any existing axial provider. The future adapter must supply the
identified zero-incidence powered/coast input, initially the P0-prescribed
`legacy-zero-incidence-drag25` identity, with source assumptions retained. CA is
constant with incidence; total wind drag comes from transforming total CF.

The result records `Unqualified` and `NotModeledStaticOnly`. Rate increments are
`None`, including for nonzero supplied rates; reduced rates are observations,
not dynamic predictions. V0 yields zero dimensional **static** loads and null
flow/coefficient/reduced-rate observations with `ZeroSpeedStaticLoadsOnly`.
Nonzero-rate V0 static output must never be interpreted as complete aerodynamic
loads. Gravity, thrust and recovery are absent.

Finite input errors use `InvalidInput`; candidate domain failures use
`UnsupportedDomain` and return no SB1 evaluation. The candidate limits are
`0 <= Mach < 0.8`, forward flow, incidence at most 5 degrees. These are project
computational policy, **not measured validity thresholds**. No fallback exists.

## Geometry representation boundary

`CandidateGeometry` accepts connected interval endpoint areas and area integrals
from a sharp nose at station zero plus exactly one typed trapezoidal 3/4-fin set.
It requires geometry and integral-provenance identities and explicit declarations
of a smooth slender axisymmetric circular profile and identical equally spaced
thin uncanted fins. It checks finite/positive dimensions, endpoint continuity,
sharp nose, body-area/average-area upper bounds from declared maximum diameter,
fin count and fin extent within the body.

**These structural checks do not establish an as-flown supported shape.** The
integral representation cannot verify interior extrema, smoothness, slenderness,
local fin-radius/profile agreement, thickness/cant, the actual interpolation,
or integral accuracy/convergence. Geometry declarations remain caller assertions.
P0 supplies no empirically approved slenderness ratio or geometry tolerance;
none is invented. Before integration, the geometry adapter must retain actual
profile/source identity, verify its physical support and supply independent
integration/convergence evidence. Arbitrary supplied integrals are only a
candidate algebra input. The artificial fin fixture is an algebra fixture,
not a supported physical airframe.

## Verification

Checks ran with `/workspace/astraea-plan/env.sh`, `CARGO_BUILD_JOBS=1` and a 2 GiB
virtual-memory cap (`ulimit -v 2097152`). Initial `cargo fmt --check` could not run:
the installed stable toolchain lacks cargo-fmt. No component was installed.
The first Cargo command attempted a crates.io index refresh, failed to connect
through the existing proxy, and was terminated; no dependency download succeeded.
The offline follow-up used existing cached dependencies.

```
cargo test --offline --manifest-path crates/astraea-core/Cargo.toml aero_coefficients -- --nocapture
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 118 filtered out
```

The initial 11 fixtures also passed as a standalone `rustc --edition=2021 --test`
module harness before adding the reviewed CP presentation-policy fixture.
`git diff --check` passed. Final targeted Cargo output is retained
locally at `/tmp/A1a-static-provider-2026-10-26-tests.log`.

Fixtures cover full signed 3D orthonormality/determinant, force round trip and
power identity (including the independent 30-degree transform fixture); exact
moment translation/full-vector datum round trip; pure couple; cone, cylinder,
expansion/contraction and smooth closed bulge integrals; signed cancellation with
retained moment at several CGs; tiny isolated negative C without suppression;
positive/negative near-cancellation, the exact CP presentation-policy boundary,
uncertainty and conditioning; rectangular and swept fin source symbols, both fin counts and
rotated equal-spacing sums; CA0-independent normal/moment derivatives;
positive/negative pitch and yaw; reference/CG invariance; V0; absent rate loads at
nonzero rates; Mach/incidence boundaries; tail/lateral flow; nonfinite state and
unsupported/malformed geometry. Algebra uses a relative/absolute roundoff bound
of `2e-12*(1+max(abs(a),abs(b)))`; this is not a physical acceptance tolerance.

## Remaining gate

Independent code/source review and root integration review are required before
using this module. A1 still owns the one runtime/load/plot adapter, normalized DTO
and identity wiring, actual geometry construction/convergence evidence, named
axial/rate composition, failure-path propagation and legacy preservation checks.
Explicit migration, stale-calibration behavior and legacy save/reopen remain
unimplemented here. Subsequent source/empirical qualification and any production
activation are separate gates. No legacy bug repair or physical-outcome claim
follows from these fixtures.
