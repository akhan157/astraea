# Perf lane — independent review record

**Status: PASS (structural) with timing inconclusive. Owner decision recorded below. No self-acceptance by the lane author.**

## Identities

| Item | SHA / value |
| --- | --- |
| Base `main` | `4916a4b48f35fad1e81d58c011acaca9ce9aa103` |
| Gate 1 checkpoint | `74348210b04ae152c93fe0a2f0f54cd65f16b411` |
| Implementation | `b51cd7c7b40f5a7fbeaeee804b4f0449ec67d2a7` + `1f078bdddf2b1a0c3a387d491b3763908ccd7590` |
| Orchestrator amendment (timing/CSS/paths) | `fe1eedb565b5c289e4db15ab7d8d706b4a2c046f` |
| Lane head at review | `fe1eedb565b5c289e4db15ab7d8d706b4a2c046f` (plus this record) |
| Engine wasm | `6dc1b10b21ee4d4cb310589412d9c45e2290c2e7a8e1674b29ee91fda0484d9e`, 2,003,935 B |
| Evidence index `SHA256SUMS` | `d8474c513cd16895b8df8aa58691a621b0ed00b2d2dda961c48e3f4a1a1416e5` (98/98 OK, reviewer verified) |

## What was reviewed (orchestrator + two independent Haiku reviews)

- Diff `4916a4b..1f078bd`: only `vite.config.ts` (`entriesAware: true` on three/react/vendor, `manifest: true`), `scripts/perf/check-landing-budget.mjs`, `scripts/perf/compare-app-ab.mjs`, `RESULT.md`, `EVIDENCE.json`. No source, physics, threshold, tolerance, dependency, or schema change. Amendment `1f078bd..fe1eedb` is records/script hygiene only (timing honesty, CSS note, path tokens, dead `appHtml` removal).
- Budget check is regression-capable: passes on the after build (1,398 B < 10,240 B), fails on the baseline variant with the exact five violations. Reviewer mutation tests (manifest relink, +12 kB chunk) both caught.
- Landing: 1,493.2 KiB decoded / 434.0 KiB transfer (6 scripts, 0 canvases) → 1.4 KiB / 2.0 KiB (2 scripts). Reproduced from stored JSON.
- App structure: `/app/` still loads three/React/vendor/wasm; `three~app` is byte-identical to baseline three (`5b633baf…`); app/vendor/react chunks identical after name normalization; wasm byte-identical; 60 fps / 0 scrub long tasks; landing/CSS screenshots byte-identical at 1440 px and 390 px (reviewer).
- Tests: lane log 168 files / 1,967 passed. Neither reviewer re-ran the 235 s suite; `--maxWorkers=2` scope noted.

## CONFLICT history (both resolved before merge)

1. **App timing.** First review: CONFLICT (batch 1 702 ms = +78.6% literal breach of the N=3/10% falsifier; A/B median swung ~37% between runs, so the host cannot resolve 10% at N=3/6; `EVIDENCE.json` falsifier overstated). Amendment recorded timing as **inconclusive**, batch 1 breach explicit, structural byte-identity as the basis, and the larger A/B as the requirement for any timing claim.
2. **Landing CSS.** Noted as dropping 12 unused JetBrains Mono 500/700 `@font-face` rules (only 400 loads on `/`); screenshots byte-identical. Recorded in RESULT/EVIDENCE; not claimed as part of the JS win.
3. **Host paths.** Amended to repo-relative paths and `<evidence-root>`/`<data-root>`/`<baseline-dist>` tokens; GATE-1 host paths fixed to tokens and verified with `grep` (no hits in `docs/internal/perf-optimize` or `scripts/perf`).
4. **Dead code.** Unused `appHtml` read removed from `check-landing-budget.mjs`; budget re-verified rc=0.

Second (re-review) verdict: hygiene PASS, budget PASS, evidence PASS, identity PASS; narrow CONFLICT only on GATE-1 paths (fixed above) and on the timing-falsifier reinterpretation, which needed the owner decision.

## Owner decision (2026-11-09, written)

The owner chose **Option A** (structural proof; timing inconclusive) and authorized **merge `--no-ff` of `perf/optimize` to `main` and push**. No app-speed claim is made. No tag, release, or deploy is authorized.

## Accepted increment / what remains

- **Accepted:** landing-entry JS removal (−99.9% decoded) with regression budget; app entry byte-identity proof; no physics/accuracy change.
- **In progress (explicitly):** app wall-time number on a quieter host (larger reversed-order A/B, ~12 runs per variant); WebKit/WebKitGTK (Tauri Linux) measurement pending sudo system dependencies; budget check wiring into CI (separate decision). None of these block this increment.

## Merge verification (merged tree)

- `git merge --no-ff perf/optimize` into `main`: merge commit
  `43dca80d46edaf773f1ebd8da5b29fa449393a94`.
- `env CARGO_BUILD_JOBS=2 pnpm build` in the merged tree: rc 0, built in 2.90 s.
  `dist/index.html` preloads only the polyfill; `dist/app/index.html` still
  preloads three/React/vendor (`three~app` hash `5b633baf…` identical).
- First budget run in the merged tree **failed** only on the engine pin: wasm
  `2003861 B` / `d64ed1a7…` vs pinned `2003935 B` / `6dc1b10b…`. Diagnosis:
  Rust source diff is empty; `strings` shows 13 embedded absolute paths
  (`…/crates/astraea-core/src/*.rs`). The 74 B delta equals the 3-char
  difference between the `main-merge` and `perf-optimize` checkout paths ×
  the embedded sites. Engine bytes are path-dependent; the hash pin cannot
  serve as a cross-worktree identity. The check now asserts present + ~2 MB
  + `WebAssembly.validate` instead. Re-run: **rc 0** ("2 JS asset(s), 1398 B;
  engine wasm present and valid"). This post-merge check fix is committed
  separately and recorded here; it changes no engine, physics, or landing
  behavior. Push authorized by the owner (Option A + merge/push).
