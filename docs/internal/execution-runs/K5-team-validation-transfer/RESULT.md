# K5 research inventory — incomplete, no test run

Base `3e92a26c19c20b4329a23363124241aa93c75666`. The orchestrator froze the Gate 1 rule before measurement: every qualified direction must improve absolute apogee error against the uncorrected K3 default, with at least two independent same-airframe pairs; a tie, worsening, fewer than two qualified pairs, or an unfit source flight means no evidence and drop. Fits use the existing legacy estimator and identity.

| Candidate | Input evidence and disposition |
|---|---|
| Rabia / short fin can | Different nose, body and fin-can dimensions and different motor and site. Peak-only manifest records; not qualified. |
| Full Metal Jacket 1 / 2 | Conical vs tangent ogive nose, different body lengths; same listed motor and site inputs. Peak-only records; not qualified. |
| calisp 1–5 | Normalized nose, body and fin geometry fields match; mass overrides and ballast mass/position differ. Motors I205 for 1–3, I285 for 4–5; site inputs differ. Manifest gives peaks, not coast telemetry; not qualified on this evidence. Airframe identity needs independent confirmation. |
| Mini DX3 G69N / F67W | Protocol documents matching outer mold lines but different internal configuration: modified 344.71 g vs standard 333.55 g without motor. G69N loaded 201 g; F67W 80.8 g. G69N Raven logs contain pressure and velocity channels; fitness for the estimator remains unverified. F67W GPS logs have unreliable pad fixes; prior results say no apogee could be extracted. F67W coast fitness unverified. |
| Other R41 development cases | R41 dev manifest has 11 Mini DX3 G69N records and one each Cosmic Cargo, Top Shot and Adventurer. No second independent repeat airframe established in that manifest. R42, R44 and R47 input inventory remains incomplete. |

Qualification count is **not established**: no source fit has been verified and the requested inventory is incomplete. Do not treat this as a final drop or a test authorization. No fit-and-predict test was run. To unblock a substantiated transfer study, identify at least two independent same-airframe repeat-flight pairs with usable coast telemetry and qualified inputs; subscale transfer additionally needs a documented geometrically similar subscale/full-scale pair with telemetry. Do not open sealed R6 data.

Sources: `docs/flight-validation/mini-dx3-protocol.md`, `docs/flight-validation/mini-dx3-results.md`, `src/validation/miniDx3/`, external `R40-published-cohort/cohort_manifest.json` (sha256 `3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5`), and `R41-three-term-arms/dev-manifest.json`. External paths are relative to the evidence root. F67W was reclassified development by the owner.

## Finishing disposition — K5 DROPPED

The orchestrator clarified that independent pairs require independent airframes. The inspected inputs contain at most one repeat-flight airframe with coast telemetry, Mini DX3. Thus fewer than two independent pairs can qualify under the frozen rule, regardless of whether Mini DX3's estimator eligibility is later confirmed. No fit-and-predict test ran. This supersedes the incomplete disposition above; it is not self-acceptance.

| Input airframe | Flight count | Coast telemetry in input evidence |
|---|---:|---|
| Mini DX3 G69N (R44 / R47, R41 manifest) | 11 | Yes: Raven pressure and velocity channels in `flight-data/dofpro/G69_*_FIP*.csv`. Estimator usability not assessed. F67W is the same airframe family and does not add an independent airframe. |
| Cosmic Cargo (R44 / R47) | 1 | Yes: `docs/flight-validation/cosmic-cargo-2986-coast.csv`. |
| Top Shot (R44 / R47) | 1 | Yes: `flight-data/dofpro/TopShot_14DEC2017_E12-6_1.csv` has pressure and velocity channels. |
| Adventurer (R44 / R47) | 1 | Yes: `flight-data/dofpro/20210417_Adventurer_J510W_1_Raven.csv` has pressure and velocity channels. |
| R42 published cohort: Rabia; Full Metal Jacket | 2 each | No coast telemetry in the R40 manifest; geometry differs within each group. |
| R42 published cohort: calisp 1–5 | 1 each as recorded groups | No coast telemetry in the manifest; matching normalized outer geometry is insufficient to supply it. |
| R42 published cohort: qu8k, proteus6, dontdebatethis, kinsel, l500roc, torrent, blister, raven, iondrive, cancerdescending, byrum, ezi65, gibb, thunder-lightning | 1 each | No coast telemetry in the manifest; peak records only. |

R42 `assumptions.json` identifies the R40 cohort manifest; `r41-equality.json` lists its 23 designs. R44 `dev-vehicles.json` and R47 `r44/dev-vehicles.json` contain the same 14 development flights; R47 `r41/dev-vehicles.json` repeats those flights across model arms, not new flights. Counts above are unique flights, not simulation runs.

External input to unblock K5: two or more same-airframe repeat flights with coast telemetry and documented mass, motor and site, or a documented geometrically similar subscale/full-scale pair with telemetry. A new study must fix its decision rule before measurement.
