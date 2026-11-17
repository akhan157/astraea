# Aerodynamic coefficient provenance and limits

The production TypeScript and Rust engines share the coefficient terms below. Standard-method terms (Schlichting/Van Driest II skin friction, Ackeret fin wave drag, Hoerner form factors, McCoy boattail) carry located public sources. The cylinder base-drag branch is digitised from the measured NASA TN D-4821 Fig. 15(b) flat-base series; its M > 1.3 tail is a stated development extrapolation. The remaining rows are project-authored fittings: they have no located primary source and must not be described as validated textbook correlations.

| Term | Implemented heuristic | Evidence limit |
|---|---|---|
| Nose wave-drag shape ordering | 0.55 / 0.72 / 0.85 / 1.25 | No primary source located for these factors, transonic multipliers, offset, or clip |
| Cylinder base drag (r ≥ 1) | NASA TN D-4821 Fig. 15(b) flat-base digitisation, M 0.3–1.3; `0.2021 (1.30/M)^0.716` above 1.3 | Measured wind-tunnel flat-base series (M 0.95–1.20 unfaired); the M > 1.3 tail is a development extrapolation; not flight-validated |
| Boattail base drag (r < 0.9) | Historical `0.12 / 0.13 / 0.38` amplitude × `(Db/D)²` | Project-authored fit, unvalidated; a held-out check (R33) shows it over-predicts base drag on small-base boattails |
| Base drag blend (0.9 ≤ r < 1) | Smoothstep in r from the boattail row to the cylinder row (R39) | Unsourced continuity device (owner-approved); no measured data at intermediate base ratios; not validated |
| Motor-plume drag multiplier | 0.38 while burning | No nozzle-area dependence; not a validated plume-interaction correlation |
| Supersonic CP shift | `min(0.8, 0.45 (1 - 1/M))` calibers forward | Repository ARCAS digitization shows an aft trend instead; sign and magnitude are unvalidated |
| Fin body-lift CP station | `0.45 * rootChord` | Earlier report attribution could not be verified at equation level |

The implementation history dates the principal drag/CP heuristics to September 2026. That establishes project lineage, not numerical validity or a complete proof of independent invention. No physics was changed during the separation/provenance audit.

The independent NASA benchmarks assess selected quantities and geometries, not every term above. Passing solver parity or regression tests establishes implementation consistency, not real-world accuracy. See [ARCAS validation](validation-arcas.md) and [flight evidence limitations](../flight-validation/README.md).

Before release claims are expanded, replace or validate unsupported terms using primary-source methods and independent held-out measurements. Detailed private lineage comparisons are not distributed with this application.
