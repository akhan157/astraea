# Aerodynamic coefficient provenance and limits

The production TypeScript and Rust engines share the following project heuristics. Their exact numerical derivations have not been established from primary published sources. They must not be described as validated textbook correlations.

| Term | Implemented heuristic | Evidence limit |
|---|---|---|
| Nose wave-drag shape ordering | 0.55 / 0.72 / 0.85 / 1.25 | No primary source located for these factors, transonic multipliers, offset, or clip |
| Subsonic base drag | `0.12 + 0.13 M²` | Unsourced model coefficient; not directly comparable with base-corrected tunnel drag |
| Transonic base-drag peak | 0.38, blended between Mach 0.8 and 1.2 | Project interpolation, not a measured universal peak |
| Supersonic base drag | `0.38 / M^1.2` | Unsourced decay law |
| Motor-plume drag multiplier | 0.38 while burning | No nozzle-area dependence; not a validated plume-interaction correlation |
| Supersonic CP shift | `min(0.8, 0.45 (1 - 1/M))` calibers forward | Repository ARCAS digitization shows an aft trend instead; sign and magnitude are unvalidated |
| Fin body-lift CP station | `0.45 * rootChord` | Earlier report attribution could not be verified at equation level |

The implementation history dates the principal drag/CP heuristics to September 2026. That establishes project lineage, not numerical validity or a complete proof of independent invention. No physics was changed during the separation/provenance audit.

The independent NASA benchmarks assess selected quantities and geometries, not every term above. Passing solver parity or regression tests establishes implementation consistency, not real-world accuracy. See [ARCAS validation](validation-arcas.md) and [flight evidence limitations](../flight-validation/README.md).

Before release claims are expanded, replace or validate unsupported terms using primary-source methods and independent held-out measurements. Detailed private lineage comparisons are not distributed with this application.
