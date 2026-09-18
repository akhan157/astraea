# E2E-Depth — Jev Verdict Log

Run against the live app at http://localhost:5190 (main @197a05e, merged B shell, Hub main-app).
Driver: headless Chromium via Orca's embedded browser (`browser.open`/`tab.run`/`observe`), all 7 areas in order.
Each area produced a JSON state dump (`evidence/area-*.json`) and a Jev triage call
(`node scripts/jev-triage.cjs <dump>` with the coordinator-provided OPENROUTER_API_KEY,
env-only, never written to disk). Verdicts below are the harness routing output
(confidence < 0.60 or needs_rerun in [0.40, 0.60] => ESCALATE; page_state==clean => PASS; else FILE with label).

| # | Area | Dump | Verdict | Jev detail | Latency | Cost |
|---|------|------|---------|------------|---------|------|
| 1a | Field edits — staged nosecone 165→175 | area-1-staged.json | **PASS** | page_state=clean (0.610) | 413 ms | $0.000035 |
| 1b | Field edits — committed 180 after Discard/Esc | area-1-final.json | **PASS** | page_state=clean (0.770) | 333 ms | $0.000035 |
| 2a | CSV import — valid flight log | area-2-valid.json | **PASS** | page_state=clean (0.720) | 345 ms | $0.000035 |
| 2b | CSV import — malformed, prior import preserved | area-2-malformed.json | **FILE** (stale_honest) | honest error banner shown; severity medium | 257 ms | $0.000035 |
| 3 | Exports — .rkt/.eng triggered | area-3-export.json | **ESCALATE** | low confidence 0.290 (clean vs stale_honest vs stale_mislabeled); severity medium-high | 422 ms | $0.000039 |
| 4 | Undo/redo — compare basis follows tail | area-4-undo-redo.json | **PASS** | page_state=clean (0.730) | 276 ms | $0.000038 |
| 5 | Filter×repair — repair target not surfaced | area-5-filter-repair.json | **FILE** (stale_honest) | severity high/critical-leaning (2.62) | 305 ms | $0.000041 |
| 6 | Keyboard-only — digits, Ctrl+Enter, Esc | area-6-keyboard.json | **PASS** | page_state=clean (0.930) | 329 ms | $0.000039 |
| 7 | Narrow viewport 1280×800 | area-7-narrow-viewport.json | **PASS** | page_state=clean (0.980) | 294 ms | $0.000031 |

Total Jev cost ≈ $0.00035 (9 calls, typesafe/jev-1.13).

## Findings (FILE / ESCALATE evidence)

### 3 — Export downloads did not materialize (ESCALATE)
Repro: Header → `.rkt` (Preview RockSim...) → dialog shows `estes-alpha-iii-replica.rkt`, Download enabled → click Download → dialog closes, **no download**.
Trace: live `URL.createObjectURL` trap recorded 0 calls, no `<a>` created, no Puppeteer `download` event, no error banner, no navigation, console clean.
Payload sanity (same export modules the panel feeds): RKT 1327 bytes RockSimDocument XML; ENG 101 bytes RASP thrust table (`Estes C6 18 70 ...`).
Backing evidence: `evidence/area-3-eng-preview.webp` (ENG dialog open), `evidence/area-3-export.webp`, DOM/console excerpts in the dump badges.

### 5 — Mount repair chain absent for a solid mount (FILE)
Repro: Airframe → select Main Body Tube (BT-50) → Inner Diameter 0 → Apply → the commit lands (mass 5.7g→102.2g, store inputs show 0.0, Trajectory shows
`Not runnable — repair the inputs above`) — but the tree row never carries the `action-needed` state, Trajectory shows no
`No motor mount — mark a mount tube in Airframe.` repair link, and with the Recovery filter hiding the mount no
`Repair target hidden by the current filter` labeled empty state appears (expected per `pickStateFor`/`ComponentTree.data-filter-hides-repair`).
Backing evidence: `evidence/area-5-filter-repair.webp`, DOM excerpts in the dump badges (banners empty, badge text carries the repro).
Note: the same scenario was exercised with the checkbox-driven ambiguous path; checkbox synthetic toggle did not stage in the embedded browser
(harness artifact), so the solid-mount repro is the filed evidence.

### 2b — Malformed CSV (FILE is the *expected* classification)
The app behaved correctly: malformed header rejected with the honest alert `parseAltimeterCsv: unrecognized header row...`, and the prior
`Flight 1 (CSV) [current]` import was preserved. Jev files it as stale_honest because the dump carries an error banner; this is the designed
behavior, not an app defect. Backing evidence: `evidence/area-2-malformed.webp` + exact banner text in the dump.

## Notes
- Console errors: 0 across all 9 dumps (per-area `page.__e2eMsgs` filter on console `error` level).
- Overflow: `{x:false, y:false}` in all dumps incl. 1280×800; no document-level horizontal scrollbar in any studio at 1280×800; both side
  panes and the labeled `Studios` nav (5 tabs) remain visible.
- Evidence validator: `node scripts/e2e-depth/validate-evidence.cjs` (deterministic, no network) — green on the committed dump set.