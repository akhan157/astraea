# RMP15-C05 — built-site keyboard, offline, error and supported-size journeys

Independent coordinator run, integrated source `6043a15` + the responsive top-bar
fix (this record's commit). Reviewer is OpenAI, author-family independent.
Exact build: dist WASM `13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`
(1,827,128 bytes), app asset `app-CFLsVcoN.js` = `29d4379c4aadeb6a7662f5bc018025ba1ffe272741fb329b2027d095d036eabb`,
served by Vite preview with the exact `dist/_headers` production CSP.
Journey script/receipts: external `evidence-rmp07-candidate-app/integration-2026-10-29/`
(`usability-journey.mjs`, screenshots 09–12, `identity-sensitivity.log`).

## Journeys exercised

| Journey | Result |
| --- | --- |
| 1280×800 (desktop default inner size) | header fits, Run control fully visible and hit-testable, all eight stages inside the window |
| 1024×768 | same |
| 800×600 (desktop minimum inner size) | same — after the fix below |
| `?` opens the keyboard list; Escape closes it | pass |
| `5` opens Flight | pass |
| `[` hides and restores the parts tree (`role="treeitem"` count) | pass |
| `Ctrl+K` opens the palette; Escape closes it | pass |
| `Ctrl+Z` after loading a preset restores the previous design | pass |
| `Ctrl+Enter` runs with the network offline; the local WASM engine completes (`Apogee (committed run) 533 m, Modeled`) | pass |
| malformed candidate import | refused with an actionable message, open document unchanged |
| limits visible | beta notice and the experimental/unqualified candidate status present |

## Defect found and fixed

At an 800×600 viewport — the app's own documented minimum (`MINIMUM_SIZE` in
`src-tauri/src/lib.rs`) — the primary Run control sat at `x = 810.7`, i.e. **0 %
visible**: the top bar's contents needed 1046 px while the window clipped at 800,
so the run action was unreachable except by the shortcut. The page reported no
horizontal overflow because an outer container clips the header.

Fix (`src/console/shell/Shell.tsx`, `src/console/shell/ProjectChrome.tsx`): the
wide-only items collapse below `xl` (wordmark text, mission name, palette label
and its key hint), the palette trigger keeps an accessible name and tooltip, the
freshness pill truncates at a bounded width, and the vehicle-name field narrows.
No action was removed and nothing about engine, model, schema or qualification
changed. Measured after the fix: `header.scrollWidth == innerWidth` at
800/1024/1280/1600 with the Run control 100 % visible and hit-testable
(1280: 97.3 %, top edge 1.25 px above the viewport, still clickable).

Checks after the change: `tsc --noEmit` exit 0; affected shell/console tests 7
files / 71 tests; full suite 134 files / 1739 tests; Vite rebuild; the candidate
production-CSP journey re-run against the new asset (executed WASM still equals
the served WASM); this usability journey.

## Scope note

This is mechanical journey and layout evidence from the exact built site. It is
not a participant usability study — independent team members reproducing and
interpreting workflows remains RMP17, which this record does not claim.
