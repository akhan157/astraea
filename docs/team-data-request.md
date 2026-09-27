# What we need from a rocketry team

**Purpose.** One page a team lead or mentor can act on: exactly what to send, why it matters, and
what it does *not* require. Rows marked **[ledger]** are already recorded as open asks in the
[exception ledger](superset-exception-ledger.md); rows marked **[new]** are this document's
proposal and are not yet committed as decisions.

Two different needs are listed separately: **validation** (proving the physics and the workflow
against reality) and **build input** (deciding what to build and how it must behave).

---

## A. To validate Astraea

| # | Ask | Minimum viable payload | Unblocks | Source |
|---|---|---|---|---|
| A1 | **One complete flight package** — any past flight, any vehicle | altimeter log (AltOS/FlightSketch CSV or GPX) + the motor flown (designation, or `.eng`/`.rse`) + vehicle dims/mass (or the `.ork`/`.rkt` file) | The whole empirical loop: import → align → overlay → effective-$C_D$ calibration → published residuals. This is the single item that moves Astraea from "reference-validated" to "flight-compared". No new hardware, no new flight needed | **[ledger]** empirical closure |
| A2 | **Three to five flight packages** across different vehicles, motors, and conditions | same as A1, repeated | Turns one anecdote into an error distribution (apogee / descent-rate / landing scatter vs prediction), which is what a reviewer will ask for | **[new]** |
| A3 | **Raw AltOS `.eeprom` + that same flight's AltosUI CSV export + firmware version** | both files; either alone is insufficient (record offsets unprovable without the pair) | Closes E3 (raw flash-image ingestion). Only relevant if the team flies Altus Metrum hardware | **[ledger]** E3 |
| A4 | **One staged or clustered flight record** | separation event timing (from video or events log), tip-off notes, vehicle configuration | Closes E4's data half (staging/tip-off/clustering). Terrain elevation needs no team data — USGS 3DEP is public | **[ledger]** E4 |
| A5 | **A certification-process answer, not a file** | the team's RSO or prefecture answers: "would an emitter artifact plus a calibrated-$C_D$ package count as supporting data, and what does a witnessed validation flight require?" | Scopes E6 and tells us whether any software artifact can ever support a certification claim | **[ledger]** E6 |
| A6 | **Named limits you hit** | where a prediction disagreed with a flight badly enough to matter, with the numbers | Prioritises which model needs attention next (transonic drag, base drag, canopy drag, wind shear) instead of guessing | **[new]** |

## B. To build the right Astraea

| # | Ask | Minimum viable payload | Unblocks | Source |
|---|---|---|---|---|
| B1 | **A real motor and grain census** | the motors the team actually flies (designations), and for any reloadable/ex motors, the grain geometry (BATES, star, finocyl, moon, C-slot, D-grain, X-core, rod & tube) with a drawing or `.ric`/`.eng` | C10's usage check. The current [grain survey](grain-geometry-survey.md) is explicitly qualitative because no census exists; a real list decides which shapes earn an implementation | **[ledger]** C10 |
| B2 | **Recovery practice numbers** | for their real builds: bay dimensions, packed chute volume and mass, what density they consider "too tight", shear-pin sizes, and black-powder charge used vs bay volume | Calibrates the packing-density advisory and ejection-charge sizing from heuristics to observed practice (E2 / C9) | **[new]** |
| B3 | **Workflow walkthrough** | 30–60 minutes showing how one of their designs actually moves today: which tool for which decision, in what order, where files get re-entered by hand, what they re-check before a launch | Prioritises integration work (which import/export and which studio step actually saves them time) and tests the "single source of truth" claim | **[new]** |
| B4 | **Trust and refusal list** | what they would and would not accept from a tool like this: which outputs must be shown with uncertainty, which must refuse to answer | Feeds the honesty surface (validity/freshness/gate language) and prevents confident-looking numbers where the model is weak | **[new]** |
| B5 | **Where members get confused** | the recurring beginner questions (reference frames, stability margin units, CP/CG, "why did my apogee change") | Scopes the onboarding/explainer pack (C13) | **[ledger]** C13 |
| B6 | **What an evidence report must contain** | what the team would hand a mentor, sponsor, or judge after a flight, and what they do with the data today | Scopes the evidence UX completion (C12) and the report/back-cast surfaces | **[ledger]** C12 |
| B7 | **Historical logs plus the configuration that produced them** | as many past flights as they are willing to share, with the vehicle/motor each belongs to | Enables the "sensible defaults + user overrides + per-team calibration from their own logs" design (C7) without inventing generic defaults | **[ledger]** C7 |
| B8 | **A staging/clustering sponsor** | a team that actually flies staged or clustered vehicles and wants the capability modelled | The gate on the biggest remaining modelling lift (C7/E4) — design work is done, funding/need is not established | **[ledger]** C7 gate |
| B9 | **Beta testers for the desktop pass** | 2–3 people who will run [desktop-acceptance-checklist.md](desktop-acceptance-checklist.md) on their own Windows machine and report failures | Closes the largest untested surface: the native window, which no automated suite or browser session covers | **[new]** |

## C. Data handling and consent

- **Consent first.** Ask before ingesting anything, and state plainly how it will be used: internal
  calibration, published residuals, or both. Anonymised is fine; named credit is optional.
- **Team logs are theirs.** Do not publish raw logs, vehicle names, or team identifiers without
  explicit permission. Publish derived residuals (predicted vs measured deltas) by default.
- **No proprietary vendor data.** Astraea is clean-room ([IP compliance](clean-room-ip-compliance.md)):
  do not ingest closed-source vendor binaries, decompiled output, or proprietary motor data whose
  terms forbid redistribution. Team-authored logs, published motor curves, and public NASA/NACA
  references are all fine.
- **Motor curves keep provenance.** An imported curve is labelled by source (`certified` / `import`
  / `derived`) in the project envelope; a team-supplied curve should carry the same honesty, not be
  relabelled as certified.

## D. What we do **not** need

- **New hardware or a new flight** for the empirical item — any past flight works (A1).
- **Money or a formal sponsorship** to make progress; B8 is only about which modelling work is worth
  funding next.
- **Certification authority.** Astraea is an analysis and design environment, not a certifying body;
  A5 is a process question, not a request for endorsement.
- **Proprietary files from commercial tools** beyond the fair-use interoperability formats already
  supported (`.ork`, `.rkt`, `.cdx1`, `.eng`, `.rse`).

## E. Ready-to-send request

> We're building Astraea, an open-source rocket engineering workstation (airframe + aero + propulsion
> + 6-DOF + flight-evidence in one place). To validate it against real flights and to build the parts
> that actually matter, could you share:
>
> 1. One past flight package: the altimeter log (CSV or GPX), which motor was flown, and the
>    vehicle's dimensions/mass (or the OpenRocket/RockSim file).
> 2. The motors you fly most, and for reloadables the grain geometry you use.
> 3. For your real builds: bay dimensions, packed chute volume/mass, shear-pin sizes, and the
>    black-powder charge you used.
> 4. 30–60 minutes to walk us through how one design actually moves between your tools today.
>
> We'll publish only derived comparisons (predicted vs measured) and nothing that identifies your
> team unless you say otherwise. No new flights or hardware needed — any past flight is enough.