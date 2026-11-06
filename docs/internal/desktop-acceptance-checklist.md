# Desktop acceptance checklist (native Tauri window)

> **2026-10-22 Linux beta evidence.** Source `f13abde`, version 0.9.0, now has
> a genuine local AppImage with its extracted payload exercised on CachyOS/KDE.
> Native Save/Open/cancel, supported export payloads, refused imports, freeform
> round-trip, Monte Carlo completion/cancel and calibration persistence were
> exercised. Offline rendering and AMDGPU device activity were observed;
> context recovery used synthetic WebGL loss, not a driver reset.
> External reports and hashes are under
> `~/VMs/linux-beta-acceptance-f13abde/`.
> Follow-up `890756a` rebuilt a genuine AppImage and launched its own
> `--appimage-extract-and-run` path (not FUSE). Native traces now record a
> matching-input run as current while preserving its failed landing-energy
> gate; a real rail-length edit makes it stale. Evidence:
> `~/VMs/linux-beta-acceptance-890756a/`.
> Follow-up `c5ae34b` fetched the selected launch-hour forecast in the packaged
> UI, saved both forecast/manual profiles, and preserved them after a fresh
> network-isolated request failed. Explicitly applying surface wind staled the
> previous run. Evidence: `~/VMs/linux-beta-acceptance-c5ae34b/`.
> Human assistive-tech review and current Windows acceptance remain unclaimed.
>
> **2026-10-21 fix note.** Defects D1–D7 from the 2026-10-21 Windows and Linux
> passes (project `.astraea` refused on Open, mission not saved, wrong filename in
> the save status, ZIP saved under a payload name, Monte Carlo row clipped at
> 1280×800, window larger than a 1280×800 display, Mac glyphs off macOS) are fixed
> in commit `ac9cec7`; see the 0.9.0 changelog. Unit/browser coverage now has
> the named Linux native evidence above. Current Windows Save/Open/export and
> work-area sizing reacceptance remains open.

## Current architecture and outstanding native gates (2026-10-20)

The sections below preserve historical tests of named commits. **Do not use their
native-IPC/browser-unavailable assumptions as a checklist for the current build.**
Both browser and desktop now run the same Rust WebAssembly in workers; Tauri owns
native files/dialogs and updater integration, not physics command IPC.

Current software coverage is in [preview readiness](preview-readiness.md).
Chromium, Firefox and Playwright WebKit passed the browser journeys, all presets,
1,000-flight ensembles, cancellation, real cross-tab persistence and WebGL
loss/recovery. The draft Linux AppImage launched on isolated Xvfb without a dev
server and showed the ~534 m baseline flight; the newly built Linux release
binary also rendered. These are smoke checks, not full desktop acceptance.

The `macOS smoke` workflow (`.github/workflows/macos-smoke.yml`, run by
`gh workflow run macos-smoke.yml --ref <branch>` or by pushing a `v*` tag; not on
every push, because macOS minutes bill at 10x) builds the `.app` on hosted Apple
Silicon and Intel runners, launches the real bundle with `ASTRAEA_SMOKE_OUT` set
and asserts the baseline flight the app reports. It is a scripted smoke on hosted
runners, **not interactive macOS acceptance**: no one uses the dialogs, exports,
updater or a hardware GPU, so the macOS rows below stay open.

Still run on **real Windows and macOS installations**, and a normal Linux desktop:

1. Install the actual draft package, launch without a dev server/network, record
   OS/package/commit, verify bundled assets and completed baseline flight.
2. Use native Open/Save dialogs, including Cancel, and verify bytes on disk and
   unchanged project after cancellation/refusal. Reopen the saved file.
3. Export repeatedly through native dialogs; inspect actual files rather than
   relying on a success label. Test both a permitted and an unsupported import.
4. Exercise editing, undo/redo, Monte Carlo completion/cancel, stale-run withdrawal,
   telemetry ingestion and network tools in the native window. Browser passes
   do not close native integration rows.
5. Check hardware GPU rendering/context recovery, keyboard shortcuts, 1280×800
   layout, accessibility and normal window resizing on that OS.
6. Verify updater offer/consent/cancel/install with controlled signed versions
   before claiming auto-update acceptance. The private draft feed cannot serve
   public updates; do not publish just to close this row.

Do not infer simulator accuracy from these checks. Independent flight validation
remains a separate release gate. No Windows/macOS acceptance or updater install
is claimed by the Linux/browser evidence.

**Purpose.** The automated suites and the historical browser E2E log do not establish that the
*native* workstation works end to end. This checklist is the scripted acceptance pass for the
Tauri window: run it on a real desktop session, record what you actually observed, and keep the
result with the commit you tested.

**Why it exists.** The 2026-09-26 [independent verification report](archive/verify-today-report.md)
could not verify: real Tauri-window IPC (`run_ensemble_chunk`), a cancel racing a live native
chunk, `pnpm build`/`cargo` packaging, and any packaged-app journey. The 2026-09-27 pass below
closes the core native IPC, cancellation, freshness, and live Aero-display checks, but does not
cover the full imports/exports, evidence, and durable-slot journeys. The historical
[E2E verdicts](../../scripts/e2e-depth/VERDICTS.md) also recorded an export-download escalation and
a mount-repair finding from an earlier commit that this pass has not re-checked in the native
shell. Keep those findings open until their respective native journeys are exercised.

## 0. Build and launch

```cmd
:: x64 Developer Command Prompt
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cargo build --manifest-path src-tauri\Cargo.toml
```

```cmd
:: terminal 1
pnpm dev --port 1420
:: terminal 2 (x64 Developer Command Prompt)
cargo run --manifest-path src-tauri\Cargo.toml
```

Record: OS build, `git rev-parse --short HEAD`, whether the window opened at 1280×800, and any
console error. **A browser tab at localhost is not this pass** — the bridge fails closed there by
design (`src/tauri/bridge.ts`).

## 1. Native compute actually answers (the core IPC claim)

| # | Step | Expected observation |
|---|---|---|
| 1.1 | Load a preset, open Trajectory, run Monte Carlo with 50 runs | Progress counts `0 / 50` → `50 / 50`, then a result card with `50 succeeded · 0 failed`; no "Tauri IPC is unavailable" banner |
| 1.2 | Set runs to 120 (crosses the 50-run chunk boundary) | Three chunk calls; result equals the whole-ensemble mean for the same inputs |
| 1.3 | Set runs to 1000 | Completes (or takes long) with progress advancing; no freeze of the UI thread |
| 1.4 | Start a 1000-run ensemble and click **Cancel** | Notice appears immediately; the run stops before the next chunk; **no** result card; the attempt is recorded as failed/invalid, never as a completed run |
| 1.5 | Airframe → change a dimension, watch CP/CG and the 3D view | Values update without a reload; the aero/mass panels agree with the new geometry |

## 2. Imports, exports, and the durable slot

| # | Step | Expected observation |
|---|---|---|
| 2.1 | Header → Export `.ork`, then Import it back | Vehicle round-trips; no modal; any subset loss is stated |
| 2.2 | Header → Export JSON (`.astraea.json`), then Import it back | Versioned envelope loads; custom motors stay selectable |
| 2.3 | Header → **Save**, then **Open** | Save reports a revision; Open restores the saved vehicle; status text is inline (no dialog) |
| 2.4 | With a project saved, Save again | Revision increments; a second window/tab that saved first must make this one refuse with a stale-write message rather than clobber |
| 2.5 | InteropExportPanel row-6 triggers: `.rkt`, `.eng`, `.rse`, `.step`, `.stl` | Each opens an omission preview **before** bytes; refused inputs offer no download; the downloaded file matches the reviewed motor/name |
| 2.6 | `.kml` trigger with no committed run | Refuses with a visible reason; no empty file |
| 2.7 | Open a `.rse` preview, change the selected motor, then confirm | The **reviewed** motor downloads under the reviewed filename (fixed 2026-09-26; re-check in the native shell) |
| 2.8 | Trajectory → **Import CSV** with a valid wind profile, then with a broken one | Valid: rows replaced and sorted, layer count shown. Broken: inline error, hand-entered rows untouched |

## 3. Evidence and provenance

| # | Step | Expected observation |
|---|---|---|
| 3.1 | Evidence → paste an AltOS-style CSV | Samples, overlay, and a provenance block (source "pasted text", SHA-256 or "checksum unavailable", rows, dialect, unit assumptions, skipped lines) |
| 3.2 | Evidence → **Import file** a real `.csv` log | Provenance names the file and its checksum; parsed rows match the file |
| 3.3 | Import a malformed log | Inline error; the previous import and its provenance stay intact |
| 3.4 | Edit the pasted text after importing a file | The file name is dropped rather than shown beside foreign bytes |

## 4. Coherence and safety surfaces

| # | Step | Expected observation |
|---|---|---|
| 4.1 | Make a mount ambiguous (Inner Diameter 0) → Apply | Tree row shows `action-needed`; Trajectory shows the repair link; a filter that hides the mount says so instead of hiding silently |
| 4.2 | Change any input after a run | Result goes STALE with a visible reason; certification is withdrawn |
| 4.3 | Keyboard only: digits 1–5 switch studios, Ctrl+Enter runs, Esc discards staged edits | No focus trap, no modal |
| 4.4 | Narrow the window to 1280×800 | No horizontal document scroll; pane nav reaches Context, Workspace, and Inspector |
| 4.5 | ThrustCurve search (Propulsion) with the network available | Results render; Import adds the motor to the catalog; with the network down, an inline API error appears and nothing is fabricated |

## 5. Record the result

**Recorded 2026-09-27.** Windows 11 Pro x64, build `10.0.26200`; tested application commit
`65aca5f` (`fix: unblock native ensembles and mark unavailable aero data`). The native
workstation opened and remained responsive. Its outer window was 1296×839, with an approximately
1280×800 client area. `pnpm build`, `pnpm exec tsc --noEmit`, `cargo build --manifest-path
src-tauri/Cargo.toml`, and `cargo test --manifest-path src-tauri/Cargo.toml` succeeded. A
full frontend suite re-run after the ThrustCurve, parser, export-download, null-contribution,
and offline-error fixes passed **840/840 tests across 65 files** (`pnpm exec vitest run`, exit 0) — a 2026-09-27 snapshot; the suite has since grown to **858/858 across 67 files** (certified-C6 regression, compare-path closure, overlay UI ingestion). Existing Rust and
Vite bundle-size warnings remain.

| # | Result (pass / fail / not run) | Observed | Notes |
|---|---|---|---|
| 1.1 | pass | Native 50-run result completed with 50 succeeded, 0 failed; no IPC-unavailable banner. | Native Tauri window, not browser preview. |
| 1.2 | not run | A native 120-run ensemble completed: `120 succeeded · 0 failed`, `Execution: Executed`, `Validity: Valid`, with the attempt logged in the RUNS list as `MC 120 · Estes C6`. | The three IPC chunk calls were not observable — the progress surface exposes no chunk boundaries (rapid polling during the run caught no intermediate counts) — and the same-input mean equivalence was not directly observed. Automated chunk partition/parity tests cover both. |
| 1.3 | pass | Native 1000-run ensemble completed with 0 failures; Windows reported the app process as responding during the run. | Verified the native UI remained responsive during computation. |
| 1.4 | pass | Cancelling a native 1000-run ensemble stopped at 100/1000; cancellation notice appeared, no result was recorded, and the attempt was failed/invalid. | Cancellation was exercised while work was active. |
| 1.5 | pass | Accessibility SetValue on the Nosecone Length spin button staged a pending edit (the field keeps the committed value until Apply, which is the designed draft flow); Apply committed 165 → 180 mm and the workspace updated in place with no reload — CG 287 → 294, CP 406 → 420, vehicle length 476 → 491 (the LENGTH × DIA card read `491×24.8×19.8`). A second set-value + Apply cycle reverted to 165 and restored CG 287 / CP 406 / length 476 exactly. A screenshot pixel-diff of the workspace viewport between the two committed states differed on 11,435 of 58,800 sampled pixels, confirming the 3D view re-rendered without a page reload. | The earlier attempt failed because element indices shift between capture and click (transient tooltip/status nodes in the accessibility tree); the retry used double-capture index verification and was stable across four operations. No product defect found — the row was an automation artifact. |
| 2.1 | pass | Export `.ork` downloaded `estes-alpha-iii-replica.ork` directly with no modal. Import re-opened the native file picker (driven via synthetic click + keyboard), loaded the file with no modal, and round-tripped exactly: Vehicle Name "Estes Alpha III Replica", nosecone length 165.0, CG 287, CP 406, and the same 4 components (Ogive Nosecone, Main Body Tube BT-50, Stabilizer Fins 3-Fin, 12" Parachute); motor binding unchanged (`Assigned: estes_c6`); footer selection rebound to the file's component id. | No subset loss occurred for this vehicle (single fin set, all component kinds serialized), so there was nothing to state. The exporter's documented multi-fin-set serialization limitation (code comment in `orkParser.ts`) was not exercised and is not surfaced in the UI. |
| 2.2 | pass | Export Astraea JSON downloaded `estes-alpha-iii-replica.astraea.json` (4,188 bytes) with no modal. Import through the native picker loaded the versioned envelope: name, geometry (165 / CG 287 / CP 406), and all 4 components intact, with the session's custom motor record retained — catalog still showed "5 certified + 1 imported" and "Custom imports: 1" (A8 selectable after reload of the envelope). | Custom-motor retention proven by exporting and re-importing within a session that had one custom motor (A8 imported immediately before the export). |
| 2.3 | pass | Save reported "Saved locally (revision 1)" inline; after renaming the vehicle to "Restore Probe", Open reported "Opened saved project (revision 1)" and restored the name to "Estes Alpha III Replica". Status text was inline each time; no dialog appeared. | Native window; restore proven by the name reversion. The durable slot is localStorage-backed per the 2026-09-26 cutover. |
| 2.4 | pass | Opened the saved revision-2 project independently in two native Astraea processes (PIDs 7108 and 13352), then saved from the second window; it reported `Saved locally (revision 4)`. Save from the first window, still based on revision 2, showed `Save failed: stale write rejected: base revision 2 does not match stored revision 4`. Reopening in the first window loaded revision 4 and restored the same Estes Alpha III Replica project. A JSON backup taken before the experiment shows the original four components and imported A8 record. | Both native processes shared the durable WebView2/localStorage slot. The revision jump from 2 to 4 was observed, with no revision-3 intermediate captured, so the exact increment sequence is not claimed. Project content was restored unchanged after the conflict check. |
| 2.5 | pass | All five row-6 triggers opened their omission preview before any bytes: `.eng` ("RASP motor (.eng) export preview", file `a8.eng`/`estes_c6.eng`, 2 Omit lines), `.rkt` ("RockSim (.rkt) export preview", 3 Omit lines), `.rse` ("RockSim motor (.rse) export preview", 3 Omit lines), `.step` ("STEP solid model (.step) export preview", 4 Omit lines), `.stl` ("Binary STL (.stl) export preview", 4 Omit lines). Each Download landed a file in Downloads matching the previewed name: `estes-alpha-iii-replica.rkt`, `estes_c6.rse`, `estes-alpha-iii-replica.step`, `estes-alpha-iii-replica.stl`, plus `a8.eng` and `estes_c6.eng` (repeats uniquified to `(1)`–`(3)`). For the refused input (`.kml` with 0 runs) the Download button is disabled — six automated invokes produced no state change and no file. | Native window. This row found a real blocker: before the fix, only the FIRST export per app launch produced a file and every later one silently vanished (see the export download follow-up below). All evidence above was captured after the fix. |
| 2.6 | pass | Clicking `.kml` with 0 committed runs showed the refusal dialog ("No committed run yet") with Download disabled (`canExport: false`); no file landed in Downloads. | Native window; visible reason and no empty file, as specified. |
| 2.7 | pass | Opened the `.rse` preview while Estes C6 was selected (reviewed filename `estes_c6.rse` shown in the dialog), then changed the Certified motor combo to A8 while the preview stayed open. Download produced `estes_c6 (1).rse` whose content carries `<code>C6</code>` — the reviewed motor, under the reviewed filename, not the newly selected A8. | Native window; re-verifies the 2026-09-26 fix in the shell. The selection change needed keyboard drive (click + End + Enter) because accessibility SetValue is ignored on background elements while a modal preview is open. |
| 2.8 | pass | Trajectory → Import CSV with `wind-valid.csv` (rows deliberately out of order 300/0/150): the message read `Imported wind-valid.csv (3 layers) — rows replaced by the file, sorted ascending by altitude.` and the table showed 0/150/300 m. After hand-editing layer 1 speed to 7.5, importing `wind-broken.csv` raised the inline `role=alert` `Wind CSV rejected: wind profile CSV: header must include altitude, speed and direction columns (aliases: …) — the manual table is unchanged.` with all three rows untouched (speed still 7.5, success message replaced). | Native window; both halves verified through the native file picker. |
| 3.1 | pass | Pasting a quoted-header altimeter CSV (clipboard + Ctrl+V) into the "Altimeter CSV data" textarea and clicking Parse produced the block `Log provenance — what was received, not inferred`: Source file `pasted text`, SHA-256 `af6bc8bf79820eaadb661f168fff5e7a48a83028cb01628c99006ead1f59353c`, Rows parsed 5, Dialect `generic-csv`, Time unit "seconds (assumed)", Altitude unit "meters (assumed)", Skipped lines 0. The "Flight log data" paste flow in the same studio additionally created layer `Flight 1 (CSV)` with `Altitude overlay: Flight 1 (CSV)` (samples + overlay). | Native window; both evidence flows exercised. |
| 3.2 | pass | Import file through the native picker chose `altimeter-valid.csv`; provenance then showed Source file `altimeter-valid.csv` with SHA-256 `36545af201849ec5fa619e7d50da0471a1ae8ecb80f7686b2c7b8f8cebded928`, Rows parsed 5 (matching the file), Dialect `generic-csv`, units assumed, Skipped lines 1. | Native window; the file digest differs from the pasted-text digest, proving the checksum covers the received bytes. |
| 3.3 | pass | Importing `altimeter-garbage.csv` showed the inline alert `Results reflect the last successful import — the current paste failed to parse.` while the prior provenance record stayed intact (Source file `altimeter-valid.csv`, same SHA-256 `36545af2…`, 5 rows). | Native window; fail-closed: the failed import never overwrites the last good record. |
| 3.4 | pass | After the file import, typing a trailing space into the pasted text and re-parsing dropped the file name: Source file became `pasted text` with a fresh SHA-256 `c969f02811415dddeec0d73102dcb028d1315a8a43d786d9e7f5e73f65f4f5bd`, rows still 5. | Native window; edited bytes are never labeled with the stale file name. |
| 4.1 | pass | With the Main Body Tube selected, the Inner Diameter spin button was set to 0 and committed via Apply (value `0.0`, pending-edit strip cleared). The Pick state legend then read `Action needed · 1`; switching to Trajectory showed the repair link `mount 'Main Body Tube (BT-50)' is a solid tube (no bore) — no motor can be seated` with status `invalid: Not runnable — repair the inputs above`; activating the Recovery filter surfaced `Repair target hidden by the current filter` instead of hiding silently. Setting the bore back to 24.1 mm and Apply restored the state (legend count cleared, field 24.1). | Native window, both break and repair directions. This row found a real blocker first: selecting the body tube white-screened the app (see the null-contribution follow-up below); the row passed only after that fix. |
| 4.2 | pass | After a successful 50-run attempt, changing rail elevation from 85° to 86° changed freshness from Current to Stale, with a launch-options reason. | Confirms the prior result was withdrawn after an input change. |
| 4.3 | pass | Digits 1 and 5 switched studios (1 → Airframe CAD, 5 → Recovery Packaging & Flight Evidence Ledger); with a staged pending edit active, Esc returned the strip to "No pending edits"; Ctrl+Enter routed to the Trajectory studio and ran an inline 50-run ensemble (50 succeeded · 0 failed · Validity: Valid) with Cancel available and no modal. | Digits 2–4 were observed in the earlier session; digits are intentionally ignored while focus sits in an editable field (`isEditableTarget`), which was reproduced and is by design. Keyboard events arrive as synthetic input, but each result was confirmed by the resulting accessibility-tree state. |
| 4.4 | pass | At approximately 1280×800 client area, Context, Workspace, and Inspector were visible with no horizontal document scroll. | Visual confirmation from the native window; outer window measured 1296×839 including chrome. |
| 4.5 | pass (online branch) | Search "A8" returned "1 motor found"; Import reported "Imported A8 (2.2 N·s total impulse) — now in the motor catalog"; counters showed "5 certified + 1 imported"; the imported A8 became selectable in the Certified motor combo and the Installation panel resolved its metrics (peak 9.6 N, average 4.0 N, burn 0.53 s, propellant 3.8 g). | Verified live in the native window. Two blockers were found and fixed before this row passed (see the ThrustCurve follow-up below). The network-down branch was not exercised natively — its inline-error path is covered only by unit tests (`PropulsionStudio.test.tsx` transport-failure test: rejected fetch surfaces `ThrustCurve API request failed` with no fabricated results), so that expectation remains open. A scoped native attempt on 2026-09-28 (Windows Firewall outbound block for the app) was refused: rule creation needs elevation this session does not have, and the app has no runtime fetch-kill flag (its seam is `globalThis.fetch` injection, test-only). |

Native Aero follow-up: after the live studio exposed NaN values for the body tube and parachute,
the UI was changed to show `N/A` for non-finite aerodynamic contributions. The focused
`AeroPanel` regression test passed, and the running native window showed `N/A` for those
components while retaining valid nosecone and fin values.

Native ThrustCurve follow-up (row 4.5): live acceptance found two real blockers, both fixed on
2026-09-27 and re-verified in the same window:

1. The search request sent the upstream `hasDataFiles: true` criterion, whose server-side index
   matched 0 motors for every query — live search could never return a result. `thrustcurveApi.ts`
   now strips the criterion from the request and filters the response client-side, keeping only
   records with a finite, positive `dataFiles` count (2 new tests, fail-closed contract unchanged).
2. The RASP `.eng` parser required a thrust curve to start at t=0 with zero thrust, but all 26
   sampled certified Estes files begin 2–256 ms after ignition with positive thrust, so import
   rejected essentially every real file. `engParser.ts` now anchors t>0 curves with a synthetic
   (0, 0) point in the shared `buildMotorSpec`; negative-time starts are still rejected.

After the fixes, the native window searched "A8", imported the live record, and the motor became
selectable in the catalog (the "pass (online branch)" row above). The catalog option label was
also rounded to avoid displaying a raw float (2.1503979999999996 → 2.15 N·s).

Native export download follow-up (row 2.5): driving the five export triggers found that only the
**first** export per app launch produced a file — every later Download confirmed in the UI (dialog
closed, no JS error) yet silently wrote nothing. Three changes fixed and hardened this, all
verified by three consecutive `.eng` downloads plus the full five-format run in the same session:

1. Root cause: Chromium gates the 2nd+ download from one origin behind the "multiple automatic
   downloads" permission, and WebView2 has no UI for that prompt, so the request was dropped
   before `DownloadStarting` ever fired. The main window (now created in `src-tauri/src/lib.rs`
   setup so handlers can attach) answers `PermissionKind::AutomaticDownloads` with `Allow`.
2. An explicit `on_download` hook makes every request/finish visible so any future
   silent failure is diagnosable outside the webview. **Obsolete:** the hook no
   longer writes `%TEMP%\astraea-download.log`; that diagnostic was removed because
   it wrote export URLs and full destination paths to a predictable shared-temp
   file. The hook still allows every download, including the 2nd+ case above.
3. `vite.config.ts` now ignores `src-tauri/target/**`: Vite's watcher was crashing with an
   unhandled EBUSY whenever cargo relinked the debug binary, which repeatedly killed the dev
   server mid-session.

Native contribution null follow-up (row 4.1): selecting the Main Body Tube white-screened the
native app (React unmounted; the page fell to its HTML skeleton). Captured via a temporary
`window.onerror` breadcrumb that wrote the exception into the window title:
`TypeError: Cannot read properties of null (reading 'toFixed')`. Root cause: Rust serializes
`ComponentContribution.cp`/`cna` (`Option<f64>`) as JSON **null** for non-lifting parts, but the
UI guards checked `!== undefined`, so null passed into `.toFixed(2)`. Browser and jsdom runs
never receive IPC contributions, which is why the suites missed it. Fixed in `7a45186`:
`!= null` guards in `PropertyInspector` (also stops a misleading `0.0 mm` CP row) and
`stabilityBreakdown`, `N/A` instead of `NaN` in the aero sidebar, plus a regression test that
renders a null-contribution body tube. Verified natively: selection keeps the page alive,
physics panel renders with CP/CNa rows hidden.

Final-state re-verification (2026-09-27, after all commits): the app was **restarted fresh**
against the committed tree and every fix re-exercised end-to-end, not from cached state:

- ThrustCurve search for "A8" returned `1 motor found` (client-side `dataFiles` filter).
- Selecting the Main Body Tube kept the page alive (176 elements vs 17 before) with the
  physics panel rendered and CP/CNa rows hidden (null-contribution guards).
- The aero sidebar showed `N/A` — not NaN — for the body tube and parachute while the nosecone
  (CNα 2.000) and fins (CNα 22.318) kept numeric values.
- Nosecone Length 165 → 170 with Apply recomputed CG 290 / CP 411; the **Undo button** restored
  165 / 287 / 406 exactly. (Keyboard Ctrl+Z while the number input holds focus is swallowed by
  the field itself — the documented `isEditableTarget` design from row 4.3, not a defect.)
- Blueprint SVG, Blueprint PNG (15,735-byte canvas raster), and the then-shipping Aero-matrix CSV
  all downloaded with `requested → finished success=true` entries in `%TEMP%\astraea-download.log`;
  PNG had previously been unexercised. At the time of this pass the export surface also included
  a closed-format `.CDX1` path and an aero-matrix CSV writer, both removed in the 2026-10-17
  homemade-only cutover and **not** covered by this record. The remaining export surface is
  Blueprint SVG/PNG, the five row-6 triggers, Save/Open, `.ork`/JSON export, and both
  picker-driven imports.
- `pnpm build` (`tsc && vite build`) passed on the committed tree.

This is a partial acceptance pass, not a claim that all checklist rows passed. Row 2.4 was
closed after this summary was written (two-process stale-write evidence); rows 1.2 and the
ThrustCurve network-down branch remain open (see §5 for the packaged-release finding).

Any failure: capture the exact steps, the on-screen text, and a screenshot. Do not close a row as
passing from a unit test alone — the point of this pass is the native window.

## 5. Packaged release verification (resolved 2026-09-28)

- `cargo tauri build --bundles msi` now completes: `Astraea Workstation_0.1.0_x64_en-US.msi`
  (3,313,664 bytes) plus `astraea-workstation.exe` (9,553,408 bytes), after three fixes:
  bundle `category` `Science` -> `Education` (Tauri `AppCategory` rejects `Science`), an
  explicit bundle icon list plus a regenerated multi-size `icons/icon.ico`, and the real
  blocker: enabling the `tauri` `custom-protocol` feature. Without it `cfg(dev)` stayed on in
  release builds and `get_app_url()` returned `devUrl` (`http://localhost:1420`), so the
  window rendered a Chromium network-error page instead of the embedded assets.
- **The packaged app renders.** The MSI payload (extracted with `msiexec /a`, since a quiet
  per-machine install needs elevation this session does not have) launches to the full
  workstation: **181 accessibility elements**, document origin `http://tauri.localhost/`
  (embedded assets, not the dev server), header, studio navigation, CG 287 / CP 406, mass
  45.7 g (observed before the 2026-09-28 certified-C6 swap, whose motor is 1.7 g lighter; the figure is a render check, not a mass oracle). Verified on both `target/release/astraea-workstation.exe` and the MSI-extracted copy.
- Measurement caveat: first paint on a cold WebView2 profile took roughly **25-30 s**. Probing
  at 10-20 s shows a 15-element window with no document, which is exactly what produced the
  earlier false "blank window" verdicts. Wait at least 30 s before judging a release launch.
- Build-cache note: a stale `tauri` build dir with `cargo:dev=true` survived the feature
  change; `cargo clean -p tauri` plus a rebuild left a single `cargo:dev=false` dir, after
  which the app rendered.
- Still open: a real elevated MSI install, and first-run WebView2 prerequisite checks. Attempted 2026-09-28: quiet install (`msiexec /i ... /qn` with verbose log) fails with exit 1603 — the package is per-machine (`ALLUSERS = 1`, `INSTALLDIR = C:\Program Files\Astraea Workstation\`) and silent mode cannot elevate (`MSI_LUA: Installation UI level is silent, no credential elevation is possible`). The payload remains verified via `msiexec /a` extract + launch only.

## What this pass still does not establish

- Empirical accuracy: this is a workflow check, not flight validation. The first real-flight
  comparison (public Altimeter Cloud flight 2986, Estes C6-7, Estes Cosmic Cargo) is recorded
  in [flight-validation/README.md](../flight-validation/README.md): the pipeline over-predicts
  apogee until payload mass is accounted for, and it is a comparison, not a calibration.
- A real installed (elevated) MSI run: the packaged payload renders when extracted and
  launched, but no per-machine install was performed in this session.
