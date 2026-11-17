# Bounded frontend integration result — 2026-11-12

Source `916519f`; overall in_progress, no full acceptance-register PASS.

Site temperature, nozzle pressure, built-up drag and nose tip inputs are wired. Shared capture/dispatch guard rejects mismatched caller options; saved archives require exact derived-option presence/value; archived flight/ensemble source strings remain verbatim; flight Basis distinguishes built-up, explicit refusal, and unknown provenance. Committed bridge calls enforce model pairing; preview remains deliberately ungated.

Commands actually run:17 changed test files281 passed (maxWorkers2); six archived-run regression files183 passed; tsc noEmit exit0; pnpm build exit0; scoped and full node scripts/browser-smoke.mjs exit0 under production CSP. Full browser includes reload,1000-flight ensemble/cancellation, calibration persistence, exports and checksum.14 screenshots at1280/1600 widths in external evidence; coordinator inspected Mission and supported/refused Flight Results screenshots. No scientific qualification inferred. Engine source unchanged since69cc029; WASM hash in EVIDENCE.json.

Review stops and failed attempts are retained in REVIEW-RETURN-1.md on author lane and REVIEW-RETURN-2.md here. Codex source review, DeepSeek repair, Codex recheck, interrupted Claude review and owner-switched Chat continuation are distinct. No Claude verdict invented. Final string guard was fixed by coordinator per harness instruction for small review findings; not a new independent acceptance verdict. This local integration is a bounded in_progress increment, not author self-acceptance or release acceptance.

Remaining: nose-tip browser interaction, opted-in Saved Runs/ensemble provenance browser display, formal independent acceptance of final corrective guard, and merged-tree verification. Main/push/release deliberately excluded. Root untracked comparison probes preserved.

## Merged-tree verification

Local frontend/design merge `ebbaff8e852ec070e6ab7cb14094d048b73a9604`. Rebuilt WASM SHA256 `91c94095bc76823ceebdf57ee26ca75325273a4d2c8c6fb4cc1e2a14bd3a3f32`. Production build exit0;17 changed test files281 passed; scoped production browser exit0 in merged tree. Full production smoke previously exit0 on byte-identical source in integration tree; earlier reload timeout did not recur. One premature merged test attempt used the old WASM while rebuild was still running (279pass/2fail); repeated all281 after rebuild and retained both logs. Source and executable now consistent. All temporary browser runtimes closed. Existing untracked comparison probes preserved. No main merge/push/tag/release. Remaining checks above remain open; parent register and release manifest unchanged because no broad acceptance or release identity is approved here.
