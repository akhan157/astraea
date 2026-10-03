# Experimental copilot (handoff from the UI direction session)

**Date:** 2026-10-03. **Origin:** a frontend/UI-direction session (`claude/upbeat-allen-ol4h5e`). This branch is for designing and building the copilot only. Engine and validation work lives on `claude/engine-validation-roadmap` (see `docs/handoff/engine-validation-roadmap.md` there). No copilot code exists yet.

## Owner's decisions so far

- **It ships as an experimental feature**, off by default and clearly labeled.
- **Two tiers:**
  1. **Built-in basic assistant.** No LLM, no training budget, works offline. A coded, rule-based helper in the spirit of pre-LLM chatbots. Its best realistic form:
     - deterministic checks ("stability above 3 cal", "rail exit below 30 m/s", "descent above 7.6 m/s", "apogee off target by more than 5%")
     - each proposing a concrete fix that it **computes by running the engine**, for example bisecting fin span until stability reaches 2.2 cal, then showing before → after
     - plus keyword/intent-matched explanations of terms and results.
  2. **Bring-your-own AI provider.** Users connect their own account, by OAuth where the provider supports it or by API key. Target providers: whatever collegiate students actually have. Candidates are OpenAI (ChatGPT), Anthropic (Claude) and Google (Gemini, which many students get through school or Google accounts). *Research task:* survey what students typically have access to, and what each provider allows for OAuth vs API key in a desktop app.
- **Rejected:** shipping a local LLM (too heavy) and the project hosting or paying for a model (free, open-source project with no budget).

## Hard rules (from the "no fluff / no false certainty" principle)

1. **The engine produces every number. The AI never does.** For any quantitative answer, the copilot must call the engine (via the same Tauri commands the UI uses) and quote the result with its confidence level (Measured, Calibrated, Modeled, Extrapolated or Unknown).
2. **Nothing changes without the user's explicit click.** Every applied suggestion goes through the normal undoable edit path and appears in history.
3. **Fail closed.** If the provider is unreachable, or the answer cannot be grounded in an engine result, say so. Do not guess.
4. **Keys and tokens stay local**, in OS secure storage via Tauri, and are never logged or sent anywhere except to the user's chosen provider.

## Proposed use cases (to prioritize)

- **Explain:** "Why is my rocket overstable?" Built from the per-component stability breakdown (`src/aero/stabilityBreakdown.ts`, `explainStability`).
- **What-if:** "What if I switch to a K motor?" Runs the case and shows deltas.
- **Fix suggestions** for failing Verify gates (tier 1 can already do this deterministically).
- **Log-format mapping (high value):** teams record flights with many devices and custom formats (AltOS primary; Featherweight, Eggtimer, StratoLogger, RRC3, Blue Raven, CATS, SRAD). The AI tier can *propose* a column/unit mapping for an unknown CSV. The user confirms it, and the import then runs through the deterministic importer with provenance (`src/evidence/logProvenance.ts`). The deterministic mapping editor itself belongs on the engine branch, since it must work without AI.

## Design questions still open
- Where the copilot lives in the workstation UI (a side panel versus a ⌘K extension). Coordinate with the frontend branch.
- How far the tier-1 assistant can go: intent matching, templated explanations, and a small curated FAQ from the docs.
- The provider abstraction: one tool-calling interface that exposes a fixed set of engine "tools" (run case, stability breakdown, mass rollup, aero curves, sim, Monte Carlo) to whichever provider is connected.
