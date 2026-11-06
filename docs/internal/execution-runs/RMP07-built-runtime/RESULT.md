# RMP07g — exact built runtime, RMP07-C08 PASS (browser build)

Source e7e3bf67880b225ceedf2a23d4c0d3645336df4d (no source change), review ACCEPT.

Receipt on the HEAD build: dist asset astraea_engine-DXTV52_r.wasm SHA-256
b32e7b7c… / 1546041 bytes = the single .wasm response served to the running app
(CDP response body, page+worker targets) = the identity recorded on the saved
run and shown as current by Model status. Executed-buffer leg: one fetch, the
same buffer hashed and compiled, Module shared with workers (identity.ts,
pool.ts, worker.ts; identity.test.ts). Asset-binding rule added to CHECKS.md.

Scope: browser build in managed Chromium. Desktop/Tauri and other browsers are
RMP16. A future changed WASM needs a new receipt under the rule.
