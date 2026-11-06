# RMP18 rights/security — proposal gate decision

Reviewer: OpenAI coordinator, independent of the DeepSeek author family.
Lane pin `0f6f08e`; proposal only; one bounded isolated repro of item A.

## Verdict: APPROVED WITH AMENDMENTS

The inventory is the first real one this project has: 51 font binaries, 170
production JS packages (155 with local license text), the WASM engine plus 21
lock crates, and a documented-yet-unverified NASA CEA data subset. Shipping no
notice file at all while redistributing OFL fonts is the concrete gap, and the
extracted-function reproduction makes the native logging defect real rather than
theoretical (predictable 0644 file, symlink followed, no size bound).

## Amendments

1. **A: removal approved** exactly as proposed — delete `log_download` and its now
   unused imports, keep `.on_download(|_webview, _event| true)` with the privacy
   comment, keep `AutomaticDownloads => Allow` and the explicit hook. Remove
   `SystemTime`/`UNIX_EPOCH`/`OpenOptions`/`Write` only if genuinely unused after
   the delete, and prove it by grep plus `rustfmt --check`.
2. **A: proof limitation is accepted but must be labelled everywhere it is cited.**
   Offline `cargo check` is impossible (0/473 Tauri crates cached); the receipt
   must say "extracted-source proof, not installed-Tauri acceptance", and the
   register disposition must not imply native runtime verification. Also state
   explicitly that the delete cannot be typechecked here, so the release build
   owner must compile it.
3. **B: generator approved** with these constraints: output must be
   deterministic (sorted, no timestamps, no absolute paths, no machine/user
   names); the shipped file must be committed and the generator must fail if the
   committed file is stale; the generator may read only locally installed
   packages and the workspace, never the network; no new dependency. The
   unresolved section must name exactly what is unresolved and why (8 JS
   packages, native closure, NASA CEA terms, motor-curve provenance) and must not
   assert any right we cannot evidence.
4. **B: notices content** must include the first-party Apache text, both font
   licences verbatim with their copyright lines, every distinct third-party text
   actually shipped, and the WASM crate texts. The JSZip SPDX dual choice is a
   licence election (MIT), not legal sign-off — say so in the inventory document.
5. **C: approved.** Keep the original sentence verbatim, prefix `Legacy model
   only.` and add the candidate-coverage sentence; delete the wording/echo/href
   assertions in `ModelStatusPanel.test.tsx` with their imports; do not repin.
6. **`docs/accuracy.md` sentence and the desktop checklist note: approved.**
   The checklist rows that referenced the removed log become explicitly obsolete
   rather than silently passing.
7. **Do not rebuild the engine.** Vite-only build; `src/engine/astraea_engine.wasm`
   must stay `13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`.
   The existing `test:browser` receipt plus a throwaway notices/claims probe are
   the runtime proof; the coordinator re-runs the full journey after merge.
8. **Scope guard.** No capability, CSP, dependency, lock, updater, schema, engine,
   register/TASKS/handoff or historical-evidence change. Do not touch the
   ensemble/sampler surfaces owned by `rmp13-scenario-provenance`.

## What this does and does not close

Closes the locally actionable part of RMP18-C03: distributable-material notices
exist, the private-path sink is gone, and unresolved items are named. It does not
establish legal sign-off, native runtime acceptance, or the rights of the data we
cannot evidence — those are recorded as external with the owners named in the
proposal.
