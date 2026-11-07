# Road to 1.0

Astraea 0.9 is a beta aimed at **college rocketry teams**. A useful 1.0 needs
both a reproducible team engineering workflow and demonstrated predictions for
its stated mission. The earlier proposed numerical gate below is a baseline,
not proof that collegiate flight regimes are covered. These targets were
drafted after the Mini DX3 results
were known; they are not that experiment's pre-registered acceptance rule.
New validation rounds must freeze their protocols before outcomes are examined.
Changes to these targets require a dated explanation, not a silent relaxation.

## Scope of the 1.0 claim

Single-stage rockets, subsonic (peak Mach below 0.8), roughly 0.5–3 m long,
on commercial solid motors. Anything outside this (supersonic flight,
multi-stage, clusters, custom motors) stays labelled experimental in 1.0.

**2026-10-22 audience correction:** this earlier subsonic boundary is not a
complete collegiate product scope. A representative competition-mission audit
and team-led design-to-flight evaluation must establish the supported 1.0
promise before it is finalized. This does not broaden current accuracy claims,
relax the targets below, or change any frozen validation protocol.

## Accuracy target

Judged only on **blind flights**: predictions are committed before the flight
data is examined, and no model change is made in response to those flights.

1. **Breadth:** at least 6 different vehicles, from at least 2 independent
   sources (archives, teams, or beta users).
2. **Per vehicle:** median apogee error within ±10 %.
3. **Overall bias:** mean of the per-vehicle median signed apogee errors within
   ±5 %, giving each vehicle equal weight.
4. **Honest uncertainty:** at least 80 % of individual blind flights fall
   inside the predicted 5–95 % range, which must include model uncertainty
   (not only uncertain inputs).
5. **Transparency:** every flight is reported with signed error, including
   failures and excluded flights with the reason, in
   [flight-validation](flight-validation/).

Time to apogee is reported for every flight; it becomes a target once enough
flights exist to set one.

## How the model may change

- Changes must be physically justified (published methods or measured
  physics), checked on development flights, never fitted to holdout flights.
- After any model change, earlier blind flights become development data; the
  target is judged on flights predicted with the final model.
- A user's own drag calibration (Verify stage) is specific to that rocket and
  evidence. It is not independent validation and never counts toward this target.

## Software

- Native acceptance passes on Windows, Linux and a real Mac.
- A team completes a design comparison and archived-flight analysis without
  developer operation; another member reproduces the saved configuration,
  assumptions and result. Passing automated tests alone does not close this.
- Signed installers on Windows and macOS; in-app updates tested against the
  real release feed.

## Status (2026-10-22)

| Criterion | Status |
|---|---|
| Vehicles tested blind | 1 of 6 (Madcow Mini DX3); not six independent airframes |
| Round 2 team-example outcomes | 0 of 2 proposed-scope cases scorable; Prometheus pressure mapping lacks a 10 s prelaunch baseline; disclosed exposures, not counted toward the blind gate |
| In-scope Mini DX3 flights | G77R/L +7.0 %, G79W/L +6.1 %; median +6.55 % |
| Out-of-scope Mini DX3 flight | H128W +10.2 % at peak Mach 0.929; reported, not counted toward the subsonic gate |
| Overall bias within the proposed scope | +6.55 % (one vehicle); above the ±5 % target |
| In-scope flights inside predicted range | 0 of 2; input-only intervals omitted model uncertainty (all three recorded flights: 0 of 3) |
| Native acceptance | Named Linux beta passes and rebuilt trace/weather fixes recorded in the desktop acceptance checklist; current Windows installers built and NSIS installed, but initial WebView is blank and feature acceptance remains open; interactive macOS pending |
| Signing, real-feed updater | Production signing and real-feed install unverified; controlled local Linux updater exercised |

Help reach 1.0: [share a flight](team-data-request.md) or use **Share this
flight** in the app's Verify stage.
