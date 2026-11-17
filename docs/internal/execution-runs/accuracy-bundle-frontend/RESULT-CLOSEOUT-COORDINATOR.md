# Three-gate result for supervising coordinator — 2026-11-13

Bounded scope completed: nose-tip UI, opted-in saved flight/ensemble display, independent final guard acceptance.3pass/0remaining in this scope. Parent program remains open; this is software/UI verification, not physical qualification or owner/release acceptance.

Base482616d6bf6e7c0fba392863e30511b6058b7739; design4542d4e; author6667f815b5d919481587b168972654aba84c9674; coordinator framing check4f511770aed6ab4996d0a9382c2e26c5ab6f9a2f; local frontend/design integration330bb4aac40b42cc0c44932dbe6bf072f380e83a. No production src/crates diff frombase. Guard verdict6f274f9, ClaudeSonnet5.5high ACCEPT; test authorPiDeepSeekV4.1Flashmax; coordinatorCodexSolmedium independent UI acceptance.

Commands actually run in this pass:

- `node --check scripts/accuracy-closeout.mjs` exit0.
- `git diff --check 482616d..HEAD` exit0.
- `node scripts/accuracy-closeout.mjs` with explicit ASTRAEA_EVIDENCE_DIR,ASTRAEA_EVIDENCE_JSON,ASTRAEA_SHOTS_DIR pointing to closeout/coordinator-run-1 paths:exit0 on lane6667f81,30screenshots.
- Same command with closeout/coordinator-merged-run-1 paths:exit0 on merged330bb4a,34screenshots, pageErrors[]. Run JSON records cwd/source/head, CSP, root/dist WASM and exact archived strings. Author-run.json and runner-evidence.json retained separately, not overwritten.
- Source tree identity and active-lane ancestor checks exit0. Historicaldf5be86,c94568f,a5890ac ancestry checks exit1 (expected, no blanket merge).
- Separate Claude reviewer ran focused vitest4files76tests,tsc,and before/after node probe,all exit0. Those are reviewer commands, not new coordinator test runs.

Evidence root is external sibling evidence-accuracy-bundle-frontend/closeout. Inspect coordinator-merged-run-1.json/.log and coordinator-merged-run-1-shots/; hashes in coordinator-closeout-sha256.json. Key screenshots:1280-nose-warning.png,1600-nose-persisted.png,1280-build-saved-ensemble-supported-after-reload.png,1280/1600-build-saved-ensemble-refused-after-reload.png. Raw author and guard verdict artifacts preserved. Current WASM91c94095bc76823ceebdf57ee26ca75325273a4d2c8c6fb4cc1e2a14bd3a3f32/2034544bytes, exact same as served dist. Historical lane build21eea59.../2035057bytes clearly distinguished. Source identity consistent before each browser probe.

Nose add/edit/clear and explicit save/open roundtrips pass;200mm not clamped, negative warns, engine refuses200mm on152mm diameter; unrelated drawing/mass unchanged. Supported and refused flight+10-run ensemble provenance displayed verbatim, stable under cleared current settings and reload; both ensemble rows explicitly scrolled into view. Known limits, refusal and not-validated wording retained. No full smoke rerun, physics edit, threshold/schema/default change, push/main merge/release or cleanup. Owned runner browsers/servers closed on exit. Root two probes and unrelated dirty files preserved.

Register arithmetic and named parent remaining checks:REGISTER-CLOSEOUT.md (parent67pass59blocked1not_applicable1not_run=128). No locally actionable work remains in this three-gate scope. Next authority step: supervising coordinator independently inspect this result before reporting bounded acceptance to owner. Separate dispersion raw-value render follow-up and historical ancestry cleanup require their own scoped disposition; not quietly added here.
