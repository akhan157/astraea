# Review — fix-smoke-default-project (2026-11-15)

Authors: codex `gpt-6.1-terra` medium (`6bf3478`, `1905432`, `f7ddabc`), then claude-pool `claude-sonnet-5-5` medium (`1a8047b`, evidence only) after Codex hit its usage limit (owner rule 2026-11-15: swap to the equivalent model). Orchestrator (Claude Opus 5.5) applied two small review fixes: `7bf49ae` (late-notice guard in the 1280 layout loop) and `0560805` (wait for app mount before the no-restore assertion).

Independent reviewer: `omp` / `deepseek/deepseek-flash` thinking max (non-Claude, non-Codex). Earlier reviewer attempts produced no verdict: `opencode-go/kimi-k3.1-pro` (Go out of funds), `antigravity` / `gemini-3.8-flash` (account disabled), `pi` / `deepseek-flash` (cancelled by owner to rerun via OMP with full access).

Verdict: **ACCEPT WITH NOTES**.

## Findings and disposition
1. Medium — no green full run at the guard commit. Disposition: full `pnpm test:browser` at `0560805` required before merge (see RESULT/merge record).
2. Low — RESULT.md "40–60 ms" settle claim: measured click-to-settle is ~0.4–0.6 s; 40–60 ms is the sample gap. Conclusion (resize lag is not the 214.1 cause) holds because the 50 % sample is ≥ 800 ms after the click. Recorded here; author text not rewritten.
3. Low — no-restore assertion raced React mount. Fixed in `0560805`.
4. Low — the per-pose notice guard can hard-fail under heavy load. Accepted: failing with the true cause beats a misleading 214 px reading.
5. Low — the 1280×800 check was listed out of scope; the layout wait and guard were orchestrator-sanctioned (REVIEW-INTERIM asked for the 214.1 diagnosis). No threshold changed (220/120, 378/281 unchanged).
6. Info — 534 pin detects a failed reset only because the prior project gives 372 m. A direct default-identity assertion would be order-independent. Not done; candidate follow-up.
7. Info — storage constants duplicated from `projectStorage.ts` / `workingSession.ts`; drift fails loudly. Not changed.
8. Info — exit codes inferred from logs; orchestrator runs now append `exit N`.

Reviewer confirmed: reset clears exactly `astraea.working-session.v1` and `astraea.project.v1` (localStorage + IDB `astraea` v1 / `projects`), nothing else; 534 ± 2 m matches `browser-smoke.mjs`; no threshold relaxed; no `src/` or `crates/` changes; later accuracy steps use a same-session baseline; falsifier log shows 372 m on the pre-reset code.

## Orchestrator runs at `0560805` (logs: `~/astraea-walkthroughs-2026-11-12/main-checks-2026-11-13/logs/`)
| Run | Exit | Result |
|---|---|---|
| `smoke-default-project-orch-0560805-run1.log` full | 1 | 1280 region 239.6 px pass; then untouched file-open journey `preview-journeys.mjs:935` "Could not load broken.astraea.json" 5 s timeout, load ~16 |
| `smoke-default-project-orch-0560805-scoped.log` accuracy only | 0 | baseline 533 m; reset helper exercised |
| `smoke-default-project-orch-0560805-run2.log` full | **0** | 1280 region 239.6 px; default baseline 533 m |
Earlier at `7bf49ae`: two full runs failed on untouched journeys (reload timeout `:889`, first `goto` `:111`) under load 18–19.

Finding 1 closed by run2. Accepted for merge by the orchestrator on the independent reviewer's verdict; the authors did not self-accept.
Follow-up (separate lane, not this one): untouched journeys time out at 5–30 s under host load (`:111`, `:137`, `:889`, `:935`, `:1240`, `preview-depth.mjs:46`).
