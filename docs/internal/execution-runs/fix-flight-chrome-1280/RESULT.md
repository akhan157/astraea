# Flight chrome at 1280 — author; not self-accepted

Status: in progress. The Flight measurements pass, but the full browser suite exits 1 in a later accuracy journey. Independent review and full browser-suite exit 0 remain outstanding.

Base: d5b0b4847f3e65aca21a9963ee735ed85651fce1. Production changes: 2bb0983 (Flight chooser and header). Smoke-only change: 4060d0410e14f80539d8246e34d32fc4c45a9b77 (owner-authorized conditional restore-notice dismissal). No thresholds or assertions changed. No new component test: jsdom does not perform layout and cannot detect wrapping; browser measurement supplies the layout evidence.

- `pnpm install --frozen-lockfile`: exit 0.
- `CARGO_BUILD_JOBS=2 pnpm build`: exit 0.
- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm exec vitest run --maxWorkers=2`: exit 0; 183 files, 2144 tests passed. `/tmp/fix-flight-chrome-1280/vitest.log`.
- `pnpm test:browser`: two runs exit 1. Both reported `1280×800 Flight free region 239.6 px tall; rocket 180.6 px` and header/tables fit at 1280/1024/800. Both later timed out in `accuracyBundleJourneys` at `scripts/preview-depth.mjs:215`: Run simulation disabled because motor `restored_6f63fdab` was not in catalog. Logs: `/tmp/fix-flight-chrome-1280/final-smoke.log` and `/tmp/fix-flight-chrome-1280/final-smoke-retry.log`. No claim of full-suite pass.
- Pre-dismissal base falsifier: `1280×800: the Flight free region must be at least 220 px tall (got 186.8 px)`; after UI edits with notice present, 214.1 px.
- Screenshots, built app: `/tmp/fix-flight-chrome-1280/flight-1280-final.png`, `/tmp/fix-flight-chrome-1280/flight-change-1280-final.png`, `/tmp/fix-flight-chrome-1280/flight-1600-final.png`. Expanded disclosure horizontal bounds x=319..620.5, scroll width 302, client width 302.

No push, merge, or self-acceptance. ASSIGNMENT.md was not staged. Next: investigate the restored-motor failure outside this lane's approved scope and obtain full browser-suite exit 0, then independent review.
