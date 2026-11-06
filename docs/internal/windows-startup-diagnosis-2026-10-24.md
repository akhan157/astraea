# Windows startup diagnosis and next-run packet — 2026-10-24

W1.1 source review at `1745adb7265b642c6a7ecfd12e1418b51f159bcb`.
Worktree: `delivery/windows-20261024`. This is a diagnostic handoff, not Windows
acceptance. No Windows executable, installer, VM/session, native screenshot or
native launch log was available here. No behavior change is proposed as a fix.

## Disposition

**Native gate remains blocked.** The current ledger records that the `2f28c65`
NSIS package installed but its initial native WebView was blank; MSI installation
and feature acceptance remain open ([status](project-status.md), lines 103–105).
The continuation hit provider usage limits, the VM is off and artifacts were
preserved externally. This review neither powers that VM on nor retries access.

No deterministic current configuration fault was established by source review.
The useful next action is one instrumented launch of the preserved installed
package, followed by one changed-variable comparison chosen from its evidence.
Do not rebuild or clean caches before recording that failure.

## Exact source evidence

| Boundary | Evidence at the reviewed source | Meaning / limit |
| --- | --- | --- |
| Entry URL | `src-tauri/src/lib.rs:146–199` creates label `main` with `WebviewUrl::App("app/index.html")`; `tauri.conf.json:14` deliberately has no declarative windows | Programmatic creation is intentional; the empty window list is not a missing-window defect |
| Frontend assets | `tauri.conf.json:7–10` uses `../dist`, runs `pnpm build`; `vite.config.ts` uses `base: './'` and both landing/app HTML inputs | Paths agree with the workstation entry; the actual Windows embedded asset set still needs inspection |
| Build mode | `Cargo.toml:18–21` intentionally leaves `tauri` features empty and documents the CLI enabling custom protocol on release; release workflow uses `tauri-action` | This is not evidence that the preserved binary was compiled with the intended mode; retain its original build logs and runtime URL |
| CSP | `tauri.conf.json:17–23`: self scripts plus `wasm-unsafe-eval`, self/blob workers, self connections plus IPC | No obvious omitted WASM/worker allowance; WebView2's effective CSP and console remain necessary evidence |
| WASM startup | `src/engine/index.ts:53–67` imports emitted WASM URL, fetches/compiles once, retries non-streaming compilation on streaming failure; workers are module workers | Wrong MIME alone has a fallback; network/asset/CSP/compile failure can still fail the engine |
| Worker boundary | `pool.ts:76–87` posts the compiled module, catches module rejection and worker error; `worker.ts:23–41` waits for module, instantiates and replies/errors | Need distinguish page creation, worker creation, module compilation and first reply; source presence does not prove Windows execution |
| UI and initial flight | `main.tsx:18–22` renders React; `console/Workstation.tsx:41–43` starts the initial flight in an effect | Flight is asynchronous after render is requested; a worker failure alone does not explain a wholly absent document. Main-thread/import/render errors are a separate branch |
| Native diagnostics today | `lib.rs:15–28` logs downloads to `%TEMP%\astraea-download.log`; no startup phase log is installed | Download log cannot explain absence of the document and includes export URLs/paths; do not collect it by default for this defect |
| Smoke diagnostics today | `lib.rs:58–81,134–170` enables the init script only for an absolute `ASTRAEA_SMOKE_OUT`; `main.tsx:27` imports smoke after its static App dependencies execute | Init script buffers errors before app code, but those errors are not persisted if app/smoke import never executes |
| Smoke output | `desktop/smoke.ts:83–144` waits up to 180 s for initial flight, invokes native report, includes page errors/backend/WebGL/user agent; native shell writes report then exits after 5 s | A report isolates a later stage; absence is ambiguous (early failure, no bridge, write failure, or delayed init). `elapsedMs` starts inside `runSmoke`, not at process launch |

`git diff 2f28c65..1745adb -- src-tauri src/engine src/main.tsx src/App.tsx
app/index.html vite.config.ts .github/workflows/release.yml` returned no differences.
This narrows source drift in these paths, not artifact provenance or all app code.

Read-only inspection of the coordinator's already-built Linux-host frontend
(`/workspace/astraea/dist`, from the same pinned source) found `app/index.html`
and all nine directly referenced assets at their HTML-relative paths. Its HTML
SHA-256 is `f3cf48a2e4e4e91e271d557c03bae8f8644745d47a92f9321005eef4ed8b91a8`.
Emitted assets include a 1,179,073-byte WASM and a 1,235-byte module-worker script.
This excludes an absent local build entry, not a packaging/URL fault in Windows.
The fresh build/browser successes in the external coordination
`BOOTSTRAP.md` are coordinator evidence, not native checks performed by W1.

Reviewed source SHA-256 values:

```text
5ae16925626a6364300d8d6e0148195fee9ae50bb261b6c5f7ce5d55010c565a  src-tauri/src/lib.rs
05a1c30f8f68efc9bacdb3db2c9bd6648dfa448ae41ffea63b2174dd0c687283  src-tauri/Cargo.toml
8b299a8ce0a04e3abe1da68991c752dda1684d0ca4a922b046f1e0cbacde0b6e  src-tauri/Cargo.lock
5d66919814f5211d839db98c610c3ceaafcd6fd3841b9078da2cba93f27f9168  src-tauri/tauri.conf.json
634ebc94afa8a722197e6c30c9d31b325a779420c09d74272861c6437a33f947  src/engine/index.ts
47dcb6a1b729daac131331d53700dd987aab23e29168db5caf5b29af9d49a211  src/engine/pool.ts
d3a497fc4c7915718818e4c9fa5a9d21d09b15341f7c8ae8cddc745d2883eb65  src/engine/worker.ts
108e75a8e37d29c562811fcb15468a820940ba82e6fcc803c53c1d1e0b680dbb  src/desktop/smoke.ts
```

## Ranked hypothesis tree

Ranking means investigation order/information value, not an estimated probability.
The current record has insufficient observations to assign a cause or odds.

1. **WebView startup or delayed document creation.** Check native process survives,
   WebView2 child creation, actual runtime version/architecture, window and document
   at 10/30/60 s. If no document at 60 s, keep observing the bounded smoke through
   240 s and record process/resource state. If later render occurs, report measured
   latency and repeat once to distinguish cold/warm behavior. The historical
   25–30 s delay applies to the 2026-09-28 extracted payload, not current `2f28c65`.
2. **Wrong runtime URL or embedded asset delivery.** Once a document target exists,
   capture origin/path and failed requests/status/MIME. `localhost:1420` identifies
   wrong mode/dev-server dependency; expected installed app is an embedded Tauri
   origin with `/app/index.html`. Compare preserved build command/features/cache
   outputs only if URL evidence supports that branch. Do not force Cargo features
   or clean tauri preemptively: historical custom-protocol/cache findings concern
   a different package and are not a current diagnosis.
3. **App dependency/import/render failure.** Expected document and HTML but zero
   root children, failed JS imports, uncaught exceptions or CSP violations select
   this branch. Record the first error and script basename/line, not just a final
   screenshot. Current smoke can miss persisting this failure entirely. Check a
   disposable clean profile only after preserving the existing profile; do not
   delete user projects or treat cleared storage as a repair.
4. **WASM/worker failure after UI creation.** Root populated but initial flight
   failed/timed out selects this branch. Record worker-load error, WASM request,
   compile/instantiate error and smoke backend. Inspect response bytes/MIME and
   effective CSP before changing it. A failure to clone the compiled module or a
   worker startup fault needs its actual exception. Do not widen CSP by guess.
5. **Profile/GPU/host-specific failure.** If DOM/engine state is healthy while
   output is invisible, or runtime processes crash, retain WebView2 crash/event
   evidence and measured GPU/runtime information. Compare a clean disposable
   Windows account/profile or a controlled GPU setting one at a time. Do not use
   an unexplained `--disable-gpu` success as permanent fix or hardware acceptance.

Installed-vs-extracted is a comparison axis across these branches. Record both
executable hashes; a different binary/profile invalidates attributing differences
solely to installation. MSI and NSIS remain separate acceptance rows.

## Minimal next-run evidence packet

Run only once Windows access is supplied and resource/power policy permits it.
These are prepared instructions, **not commands executed in this environment**.

1. Recover preserved originals: `2f28c65` NSIS/MSI packages, build/install logs,
   exact installed executable and previous screenshots/traces. Hash files with
   `Get-FileHash -Algorithm SHA256`; record bytes, source SHA, package type and
   actual install location. Do not silently substitute a new package.
2. Record OS edition/build and CPU architecture, native/WebView2 architecture,
   WebView2 runtime version, app profile identity (use a local alias in shared
   reports), online/offline state and launch method. Record whether this is cold
   profile, process-cold existing profile or warm reload. A new environment may
   require an approved install before launch; MSI elevation is a separate gate.
3. First observe the unmodified installed app using its existing profile. Capture
   window screenshots and process/document state at 10/30/60 s; never call the
   10 s picture conclusive. Record wall-clock launch time and duration separately
   from any app-reported elapsed time. No dev server should be running.
4. Relaunch the **same installed executable** with existing opt-in smoke mode.
   Use a new, writable output directory each run, no pre-existing report. Example
   PowerShell, after setting `$installedExe` to the verified absolute path:

   ```powershell
   $runDir = Join-Path $env:TEMP ("astraea-startup-" + [guid]::NewGuid())
   New-Item -ItemType Directory -Path $runDir | Out-Null
   $previousSmoke = $env:ASTRAEA_SMOKE_OUT
   try {
     $env:ASTRAEA_SMOKE_OUT = Join-Path $runDir 'report.json'
     $launchUtc = [DateTime]::UtcNow.ToString('o')
     $appProcess = Start-Process -FilePath $installedExe -PassThru `
       -RedirectStandardOutput (Join-Path $runDir 'stdout.log') `
       -RedirectStandardError (Join-Path $runDir 'stderr.log')
     @{ launchUtc = $launchUtc; pid = $appProcess.Id;
        executableSha256 = (Get-FileHash $installedExe -Algorithm SHA256).Hash } |
       ConvertTo-Json | Set-Content (Join-Path $runDir 'launch.json')
   } finally {
     if ($null -eq $previousSmoke) { Remove-Item Env:ASTRAEA_SMOKE_OUT -ErrorAction SilentlyContinue }
     else { $env:ASTRAEA_SMOKE_OUT = $previousSmoke }
   }
   ```

   Keep observing the app/report up to 240 s: flight timeout is 180 s **after the
   smoke code runs**; cold WebView startup can precede that. Capture a screenshot
   early if report appears, because successful report submission triggers exit
   after 5 s. No report at 240 s is a bounded failure of this smoke, not proof of
   a particular failing layer. Preserve stdout/stderr even if empty. Capture an
   early exit code; if still alive, record that before closing this test's app
   normally. Do not terminate unrelated WebView/browser processes.
5. For a clean built-in Student Launch baseline only, the existing checker can
   inspect a produced report: `node scripts/macos-smoke-check.mjs <report.json>
   0.9.0`. Despite its name, assertions read the platform-neutral JSON. It expects
   the engine's own 533 ±2 m baseline, touchdown, started WASM workers and no page
   errors. Do not apply that numerical pin to a user's saved rocket, or interpret
   it as empirical accuracy. The report's `ok` alone does not check page errors;
   preserve checker output/exit. A passing smoke is still no native workflow pass.
6. If no report/blank persists, next use WebView2 developer diagnostics with local
   access. An isolated launch may set process-local
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and attach
   a local Chromium/Edge inspector to the app target. This mechanism is a proposed
   Windows diagnostic, unverified here; record whether the target actually appears.
   Restore the old variable after spawning. Do not expose the port off-host or
   leave it enabled. Avoid HAR bodies, full DOM, storage dumps and request query
   strings. Capture first script/CSP/worker errors and asset status/MIME locally.
   If developer diagnostics are unavailable, request the bounded trace below
   instead of repeatedly guessing access flags.

A useful minimal console snapshot once attached is:

```javascript
JSON.stringify({
  origin: location.origin, pathname: location.pathname,
  readyState: document.readyState,
  rootChildren: document.getElementById('root')?.childElementCount ?? null,
  canvasCount: document.querySelectorAll('canvas').length,
  smokeEnabled: '__ASTRAEA_SMOKE__' in window,
  tauriInvokeAvailable: typeof window.__TAURI__?.core?.invoke === 'function'
})
```

Keep each case's installer/executable hash, profile alias, wall-clock timing,
network state, process/renderer presence, document snapshot, report or absence,
errors, screenshot paths and exit code together in a manifest. Collect only app
and its descendant processes' timing/CPU/memory, not unrelated process lists.
Raw error strings, screenshot content and the current smoke's page errors can
contain user paths/project content; inspect/redact before sharing. Use synthetic
baseline data for clean-profile comparisons. Do not upload raw project storage,
flight logs, coordinates, environment variables or crash dumps by default.

## Delivered opt-in instrumentation (W1.2 preparation)

A subsequent coordinator-approved packet adds startup evidence in
`src-tauri/src/lib.rs` with std-only `startup_trace.rs` and an included
`startup_trace.js`. This is an **instrumented candidate**, distinct from the
preserved installed `2f28c65` package. It is no blank-window repair. The preserved
package does not implement this new environment variable; retain its original
observations before building/installing the instrumented candidate.

Set process-local `ASTRAEA_STARTUP_TRACE_OUT` to a **new absolute file path** in an
existing writable directory, for example `Join-Path $runDir 'startup.jsonl'`, before
launching the verified instrumented executable. Restore the old variable after
spawn, as in the smoke example. Record candidate source/executable/package hashes
and whether `ASTRAEA_SMOKE_OUT` is also enabled. Default launch writes no trace.
Tracing alone leaves the window open; existing smoke still reports/exits normally.
No Cargo/config/capability/CSP/URL or worker behavior is changed.

An existing destination, relative/empty path, missing parent or denied write
**disables tracing without preventing launch**. The diagnostic deliberately does
not overwrite existing evidence or create directories. Check that the new file
exists; missing output can mean disabled/unwritable trace as well as no process.

Output is newline-delimited JSON containing only allowlisted event codes and
monotonic milliseconds since trace initialization, for example:

```json
{"event":"native_run","elapsed_ms":0}
{"event":"native_setup","elapsed_ms":12}
{"event":"native_window_build_started","elapsed_ms":13}
{"event":"native_page_load_started","elapsed_ms":167}
{"event":"document_init","elapsed_ms":320}
{"event":"script_resource_error","elapsed_ms":470}
{"event":"root_empty_5s","elapsed_ms":5320}
```

Those times illustrate the format, not observed Windows timings. JavaScript events
are timestamped **when received natively**; a delayed bridge/queue can postpone
them. Their ordering against native callbacks is not an exact browser timeline.

Native milestones cover entry/setup/window build/page load and run/build failure.
The before-app script observes script/style/other resource errors, uncaught JS
errors, rejected promises, CSP categories, document/load milestones and root
population at 5/15/60 s, without importing App/main. It queues observations until
the public Tauri bridge is available. No bridge or IPC failure can still leave
native milestones; lack of page events alone does not prove no document existed.
CSP observations identify script/worker/connect/style/other categories; they do
not contain blocked URLs or establish the underlying error message.

Limits: 32 queued events, four observations per page-event code, 64 IPC attempts,
150 ms send interval and a 240 s polling/watchdog lifetime. Native enforcement
allows only main-window callers, a fixed launch destination and allowlisted
codes, with at most eight page writes/second, 96 page plus 32 native events and
16 KiB of output. Event storms may drop observations; missing later events after
a cap is not a successful phase. I/O failure stops writes without failing launch.
Native state keeps its original output handle, so page callers cannot select a
file or reopen it. No arbitrary console args, error text, URLs, file paths,
project/storage content, user agent or GPU identity is included in this trace.
Raw smoke reports still have the separate privacy limits described above.

Focused checks use `rustc --edition 2021 --test src-tauri/src/startup_trace.rs`
and Node's dependency-free `scripts/startup-trace.node.mjs`. They cover disabled
mode, path/existing-file refusal, fixed destination, main/allowlist guards,
rate/event/byte limits, write failure, late bridge, bounded queue/lifetime and
absence of raw error/URL data from IPC. The script tests run without App/main.
Native compilation and real Windows installation remain separate checks.

## Missing dependencies and successor closure

Required once: an accessible permitted Windows session plus the preserved
`2f28c65` installers, installed binary/profile and launch/install/build evidence.
Current workspace has no package/executable hashes or native trace to recover the
cause. Provider usage/billing restrictions remain unchanged; do not provision a
VM, spend, contact others or publish artifacts as part of this packet.

Successor W1.2 starts after one documented reproduction selects a cause. Review
the smallest patch, allocate a Windows build/install lease, and record fresh
source/package/executable/WASM hashes. Close startup only when the **installed**
package launches without a dev server and completes a production-WASM baseline;
then reaccept the current native journeys in the platform assignment. Keep MSI
installation/prerequisites and NSIS acceptance separate. Source review, extracted
payload launch, browser tests or this document cannot close those rows.

W1.1 verification was read-only source/history/hash and already-built asset
inspection. W1.2 preparation adds opt-in instrumentation and focused standalone
Rust/Node checks; exact results belong to its handoff. No dependency installation,
Windows execution, access retry or network request was performed by this lane.
An instrumented Linux compile or browser fixture is not Windows acceptance.
