# Static model foundation — 2026-10-26

Local successor to the [reviewed P0/N1 batch](../first-batch-2026-10-26/README.md).
This adds an unused Rust coefficient module and fixes updater lifecycle handling.
It does not activate a new flight model or establish collegiate accuracy.

## Implementation and review

[A1a method and tests](../diagnostics/A1a-static-provider-2026-10-26.md) record
the independently written source equations, exact force/wind and moment-datum
transforms, signed normal-force/moment sums, typed body integrals and fin inputs,
zero-speed meanings and explicit unqualified/static-only statuses.

The coordinator reviewed the implementation against accepted P0: force/energy
signs, arbitrary datum translation, reference scaling, the source finite-fin
normalization and midchord sweep, body integration signs, domain boundaries and
absence of implied rate loads. One rework was required: near cancellation could
produce an unreliable finite diagnostic CP. The separately named
`cp-ratio-roundoff-cancellation/1.0.0` policy now withholds only that ratio when
`abs(C)/sum(abs(Ci)) <= 64*EPSILON`. It retains signed C/J, conditioning and all
forces/moments. Tiny well-conditioned slopes remain usable; positive and negative
cancellation, the threshold boundary and invalid public sums have fixtures.
This is a numerical diagnostic policy, not a physical accuracy threshold.

**Disposition: accept the static foundation for further integration work.**
The coordinator is independent of its implementation author. No caller in the
flight, curve, engine dispatch or frontend paths uses the new provider. Apart
from the new module and its `pub mod` declaration, legacy Rust code is unchanged.
The prescribed axial input has source identity but no new drag theory; body
integrals and geometry declarations still require a real adapter and numerical/
physical verification. General wrench utilities support pure couples; SB1 does
not invent a cant, damping or arbitrary independent-couple model.

The initial Mach-below-0.8 and five-degree computational restrictions remain
candidate experiment policy. Fixed quarter-MAC above approximately Mach0.5 is a
declared simplification. These restrictions do not redefine the intended
collegiate mission family or establish an empirically validated envelope.

## Integrated checks

- Core: **130 tests pass**, including 12 new coefficient tests.
- Engine: **25 unit/integration tests pass**, retaining existing parity evidence.
- Updater lifecycle: **11 focused tests pass**; TypeScript and Vite build pass.
- The production bundle still contains the legacy WASM SHA-256
  `c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
  The standalone SB1 module was tested natively; no new SB1 WASM command or
  production provider selection was built or exercised.

Checks use cached dependencies and one compute worker per lane. The initial
author formatting check found no cargo-fmt component, and its first Cargo
command attempted an unavailable registry connection. The offline follow-up
passed; no component/dependency install was performed. Full frontend suites,
N1 studies and native packaging were not repeated. Integrated logs and retained
source artifacts live in
`/workspace/astraea-plan/evidence/sb1-foundation-20261026/`.

## Subsonic measurement preparation

[D1 source fixture](D1/README.md) freezes the short ARCAS Mach0.60 CN/Cm slice
before model comparisons. Four signed readings have independent visual passes
whose stated reading intervals overlap; the two ambiguous nearzero targets
remain excluded/null. The source embeds 300ppi scans, whereas these coordinate
renders use 144ppi; enlarged inspection images add no information. A new
revision can use native-density source images while preserving both old passes.

This is extraction consistency on a shared source, not independent experimental
validation. Geometry, local skew, symbol identity, axis conversion, source
uncertainty and native representability remain open. The finite-angle readings
are not automatically zero-angle derivatives. No slopes, CP fits, model residuals
or empirical pass threshold were derived here.

## Product workflow change and next gates

The [updater lifecycle review](../../delivery-review-2026-10-26-updater-lifecycle.md)
records duplicate-install prevention, refusal before installation when restart
is unavailable, and restart-only retry after successful apply. The user still
initiates installation. Its tests use mocked native APIs; actual signatures,
payload application, restart, channel delivery and production platform acceptance
remain separate gates. Existing native204 proof is historical transport evidence.

Next A1 work is the reviewed geometry adapter/integration-convergence evidence,
one provider for diagnostics/plots/flight, explicit model identity and migration,
and preserved legacy behavior. E1/T1 add environment and qualified supplied-data
interfaces. D1 requires geometry/convention and source extraction qualification
before matched comparisons. None authorizes a default switch, new holdout
access, outreach, publication or a primary-use accuracy claim.
