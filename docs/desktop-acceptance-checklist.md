# Desktop acceptance checklist (native Tauri window)

**Purpose.** The automated suites and the historical browser E2E log do not establish that the
*native* workstation works end to end. This checklist is the scripted acceptance pass for the
Tauri window: run it on a real desktop session, record what you actually observed, and keep the
result with the commit you tested.

**Why it exists.** The 2026-09-26 [independent verification report](verify-today-report.md)
could not verify: real Tauri-window IPC (`run_ensemble_chunk`), a cancel racing a live native
chunk, `pnpm build`/`cargo` packaging, and any packaged-app journey. The historical
[E2E verdicts](../scripts/e2e-depth/VERDICTS.md) also recorded an export-download escalation and
a mount-repair finding from an earlier commit that no later run has re-checked in the native
shell. Those are the specific gaps this pass closes.

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

Copy this table into the commit or a PR comment and fill it in:

| # | Result (pass / fail / not run) | Observed | Notes |
|---|---|---|---|
| 1.1 | | | |
| … | | | |

Any failure: capture the exact steps, the on-screen text, and a screenshot. Do not close a row as
passing from a unit test alone — the point of this pass is the native window.

## What this pass still does not establish

- Empirical accuracy: this is a workflow check, not flight validation. That needs a flown log,
  the motor flown, and the vehicle record (see the [exception ledger](superset-exception-ledger.md)).
- A packaged installer/release. Building the dev binary is not a release test.