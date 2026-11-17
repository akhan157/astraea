# Perf lane — result (Gate 1 approved; implementation complete, pending independent review)

Status: **in_progress, pending independent re-review and merge authorization.**
This author cannot accept its own work; PASS requires the reviewer's verdict on the
diff and re-run. Independent review (Haiku) returned CONFLICT on the app-timing
evidence; the amendments below (timing recorded as inconclusive, batch 1 breach
recorded, CSS note, path hygiene, dead-code removal) were made by the orchestrator
and await re-review. No merge or push without owner authorization.

## Gate 1 correction

`GATE-1-DESIGN.md` line 9 records the lane head as `c237bf5` (the ASSIGNMENT
checkpoint). The actual Gate 1 approval reviewed and approved lane head
`74348210b04ae152c93fe0a2f0f54cd65f16b411`. History is not rewritten; the
correction is recorded here, as instructed.

## Exact identities

| Item | SHA / value |
| --- | --- |
| Base `main` | `4916a4b48f35fad1e81d58c011acaca9ce9aa103` |
| Gate 1 checkpoint | `74348210b04ae152c93fe0a2f0f54cd65f16b411` |
| Implementation commit | `b51cd7c7b40f5a7fbeaeee804b4f0449ec67d2a7` |
| Engine wasm | `6dc1b10b21ee4d4cb310589412d9c45e2290c2e7a8e1674b29ee91fda0484d9e`, 2,003,935 B |
| `main` three chunk (baseline) | `5b633baf476cad6e5b1766b5bb8941f235c38814e15a675122c6e41e6bd4bf4d` |
| `main` landing entry | `GH7vVJOA` (imports vendor → three + react) |

Raw evidence: `<evidence-root>/perf-optimize/`, index `SHA256SUMS`
(`d8474c513cd16895b8df8aa58691a621b0ed00b2d2dda961c48e3f4a1a1416e5`).
Units note: "kB" below means KiB (bytes/1024); the budget uses bytes.

## What changed

Exactly the approved plan, no source/dependency/physics/threshold/tolerance/
schema change:

1. `vite.config.ts`
   - `entriesAware: true` on each `build.rolldownOptions.output.codeSplitting.groups`
     entry (`three`, `react`, `vendor`).
   - `build.manifest: true` so the budget check reads the actual entry graph.
     Output-only artifact; no runtime asset or hash changes.
2. `scripts/perf/check-landing-budget.mjs` (new): static build check. Fails if
   the landing entry loads a three/react/vendor chunk, if landing JS is
   ≥ 10,240 B, if the app entry stops importing three/React/vendor, or if the
   engine wasm size/hash changes. Proven non-tautological: it fails against the
   pre-change build with the exact five violations.
3. `scripts/perf/compare-app-ab.mjs` (new): interleaved baseline/candidate
   startup A/B so host drift is not mistaken for a regression.

No other tracked file changed. The four Gate 1 probe scripts are unchanged.

## Before → after

### Landing entry `/` (the hotspot)

| Measure | Baseline | After | Change |
| --- | --- | --- | --- |
| JS decoded | 1,493.2 kB | **1.4 kB** | −99.9% |
| JS transfer | 434.0 kB | **2.0 kB** | −99.5% |
| JS scripts | 6 | **2** | −4 |
| Landing graph bytes (budget check) | 1,528,995 B | **1,398 B** | −99.9% |
| `load` event (N=3, localhost) | 81–139 ms (median 117) | 23–70 ms (median 51) | ~−56% median |
| FCP (N=3) | 48–236 ms (median 104) | 68–240 ms (median 76) | unchanged range |
| Long tasks | 0 | 0 | — |
| Canvases | 0 | 0 | page is HTML/CSS by design |

Commands:
`node scripts/perf/measure-landing.mjs --out <evidence>/perf-optimize/after --runs 3`
and the same command with `--out <evidence>/perf-optimize/ui` for the baseline.

### Workstation `/app/` (must not regress)

Direct batches (N=3 each, same probe, real GPU):

| Batch | Committed-run samples (ms) | Median |
| --- | --- | --- |
| Baseline (`ui/baseline-gpu`) | 686 / 393 / 393 | 393 |
| After batch 1 (`after/after-gpu`) | 702 / 399 / 913 | 702 — **literal +78.6% breach** of the 10% falsifier; recorded, not excluded |
| After batch 2 (`after/after-gpu-2`) | 765 / 404 / 415 | 415 (+5.6%) |
| Reviewer re-run (`review-ui`) | — | 412 (+4.8%) |

Interleaved A/B (6 loads per variant, alternating in one browser/time window,
`after/app-ab.json`): baseline committed median **409 ms**, after **399 ms**
(**−2.4%**); engine median **211 ms** vs **201 ms**. Reviewer's A/B re-run
(`review-app-ab.json`): 408 vs 645 ms (−36.7%). Both variants slow together in
late runs, so drift was real, but the 6-run median swung ~37% between two A/B
runs. Falsifier threshold: baseline median 393 ms × 1.10 = **432.3 ms**.

**Timing verdict: INCONCLUSIVE on this host.** Batch 1 breaches the literal
N=3/10% rule; batch 2 and both A/Bs sit inside it. The host cannot resolve a
10% difference at N=3/6, so timing is not claimed as PASS. The no-regression
basis is structural: the app entry still loads three, React and vendor, the
three chunk is byte-identical to baseline (`5b633baf…`), the engine wasm is
byte-identical (2,003,935 B, `6dc1b10b…4d9e`), and 60 fps / 0 scrub long tasks
hold in every after run. A timing number for the owner-facing claim needs the
larger A/B in GATE-1's plan (about 12 runs per variant, reversed order).

### Test/build

- `env CARGO_BUILD_JOBS=2 pnpm test --maxWorkers=2`:
  **168 files / 1,967 tests passed**, 234,854 ms
  (`<evidence>/perf-optimize/after/test.log`). Baseline samples were 228,016–260,258 ms.
- `env CARGO_BUILD_JOBS=2 pnpm build`: rc 0, 2,656 ms. This is **not** comparable
  to the 9.5–11.8 s baseline: the baseline samples were cold builds without
  `tsconfig` incremental state, and the after build reused it. No build-time
  claim is made.
- `node scripts/perf/check-landing-budget.mjs`: pass, landing 1,398 B < 10,240 B.
- `node scripts/perf/check-landing-budget.mjs --dist <baseline-dist>`:
  expected fail with
  `landing entry loads forbidden chunk assets/{vendor,three,react}-*.js`,
  `dist/index.html still modulepreloads a three/react/vendor chunk`, and
  `landing JS 1528995 B exceeds 10240 B`. Logs retained.

## Falsifier audit

| Condition | Result |
| --- | --- |
| Landing still preloads three/react/vendor | **No** — landing HTML has only its entry + polyfill |
| Landing decodes > 10 kB | **No** — 1,398 B (probe: 1.4 KiB decoded) |
| `/app/` stops loading three/React/wasm | **No** — app entry keeps all three; wasm bytes/hash unchanged |
| `/app/` committed median regresses > 10% | **INCONCLUSIVE** — batch 1 +78.6% (breach), batch 2 +5.6% and A/B −2.4% inside 432.3 ms; host cannot resolve 10% at N=3/6 |
| Tests no longer 168 / 1,967 | **No** — 168 / 1,967 pass |
| Engine wasm SHA changes | **No** — `6dc1b10b…4d9e` |

Structural falsifiers clear. The timing falsifier is inconclusive, not cleared;
the change stands on byte-identity proof (three `5b633baf…`, wasm `6dc1b10b…`,
app entry unchanged apart from chunk renames) plus 60 fps / 0 long tasks.

**Landing CSS change (screenshots byte-identical):** the landing stylesheet
splits to `vendor~landing~app.css` and drops 12 unused JetBrains Mono 500/700
`@font-face` rules — only the 400 face loads on `/` in either build. Reviewer
full-page screenshots at 1440 px and 390 px are byte-identical. Not claimed as
part of the JS win; recorded so the bundle diff is fully described.

## Checks that actually ran (exact commands)

```text
env CARGO_BUILD_JOBS=2 pnpm build
node scripts/perf/check-landing-budget.mjs
node scripts/perf/check-landing-budget.mjs --dist <baseline-dist>
node scripts/perf/measure-landing.mjs --out <evidence>/perf-optimize/after --runs 3
node scripts/perf/measure-ui.mjs --out <evidence>/perf-optimize/after --label after-gpu --runs 3 --gpu
node scripts/perf/measure-ui.mjs --out <evidence>/perf-optimize/after --label after-gpu-2 --runs 3 --gpu
node scripts/perf/compare-app-ab.mjs --baseline-dist <baseline-dist> --after-root <lane-worktree> --runs 6 --out <evidence>/perf-optimize/after/app-ab.json
env CARGO_BUILD_JOBS=2 pnpm test --maxWorkers=2
```

The A/B baseline dist was built from the same tree with only `entriesAware`
removed, into `<baseline-dist>`; its landing HTML still preloads
three/react/vendor, matching the Gate 1 baseline.

## Deliberately not done

- No tag, release or deploy. Push was later authorized by the owner (2026-11-09,
  Option A + merge/push); see Owner decision above.
- No edits to the register, package manifest, task board or handoff
  (`docs/internal/execution-package/*`, `docs/internal/session-handoff/*`).
- No dependency, source, physics, threshold, tolerance or schema change; no
  UI rewrite.
- WebKit/WebKitGTK (Tauri Linux webview) still not measured: Playwright WebKit
  needs missing system libraries requiring sudo. Recorded as an external
  blocker; this result is browser-Chromium evidence plus static build proof.
- No native Tauri rebuild/launch in this lane.
- Budget check is not wired into CI (would be a separate package/CI decision);
  it is a committed standalone check.

## Mediants convention

App medians use the upper-middle convention (`s[floor(n/2)]` in
`compare-app-ab.mjs`): A/B 409/399 ms. Averaged medians would be 406.5/396 ms;
the −2.4% conclusion holds either way.

Reviewer temp artifacts (not under the evidence root): `<review-tmp>/review-ui`,
`<review-tmp>/review-app-ab.json`.

## Owner decision (2026-11-09)

The owner chose **Option A**: accept the structural byte-identity proof for
`/app/` (three `5b633baf…`, wasm `6dc1b10b…`, 60 fps, 0 long tasks) and record
app timing as inconclusive on this host (batch 1 breach recorded, batch 2 +5.6%
and A/B −2.4% inside threshold). The literal N=3/10% falsifier is treated as
host noise for this change; no app-speed claim is made. The owner authorized
merge `--no-ff` of `perf/optimize` to `main` and push.

## Next concrete action

Merge `--no-ff` to `main`, re-run the budget check in the merged tree, then
record the final disposition in `REVIEW.md`. If WebKit/Tauri coverage is
required before calling the owner-facing win accepted, resolve the sudo
dependency install first; this lane cannot install system packages without
authorization.
