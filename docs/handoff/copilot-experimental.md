# Experimental copilot (handoff from the UI direction session)

**Date:** 2026-10-03. **Origin:** a frontend/UI-direction session (`claude/upbeat-allen-ol4h5e`). This branch is for designing and building the copilot only. Engine and validation work lives on `claude/engine-validation-roadmap` (see `docs/handoff/engine-validation-roadmap.md` there). No copilot code exists yet.

## Owner's decisions so far

- **It ships as an experimental feature**, off by default and clearly labeled.
- **Three tiers.** Tier 1 is always present and is the fallback whenever a higher tier is unavailable or fails:
  1. **Built-in basic assistant.** No LLM, no training budget, works offline. A coded, rule-based helper in the spirit of pre-LLM chatbots. Its best realistic form:
     - deterministic checks ("stability above 3 cal", "rail exit below 30 m/s", "descent above 7.6 m/s", "apogee off target by more than 5%")
     - each proposing a concrete fix that it **computes by running the engine**, for example bisecting fin span until stability reaches 2.2 cal, then showing before → after
     - plus keyword/intent-matched explanations of terms and results.
  2. **Small local model (the AI tier we build now).** An opt-in download (not bundled in the installer) of a small quantized model (about 1–4B parameters) run through llama.cpp, CPU-only on a typical student laptop. Slower answers are acceptable. The model only routes intent to engine tools, fills tool arguments under constrained (grammar-enforced) output, and writes prose around engine values; code inserts every number. *Open:* pick the model by a short bake-off on our own tool-calling cases; prefer a permissive licence (e.g. Apache 2.0 or MIT) over custom terms such as Gemma's, even though downloading on demand means Astraea does not redistribute the weights.
  3. **Bring-your-own provider (sidelined, not dropped).** Users connect their own OpenAI, Anthropic or Google account by OAuth where supported or by API key. Not built now; whether it is needed is decided once tier 2 and the tool interface exist. Tiers 2 and 3 share one tool-calling interface, so adding tier 3 later is a provider adapter, not a redesign. *Research task (deferred with it):* what students typically have access to, and what each provider allows for OAuth vs API key in a desktop app.
- **Rejected:** the project hosting or paying for a model (free, open-source project with no budget).
- **Changed 2026-10-03:** a local LLM was originally rejected as too heavy; the owner now accepts a *small* local model as an optional download (tier 2 above).

## Hard rules (from the "no fluff / no false certainty" principle)

1. **The engine produces every number. The AI never does.** For any quantitative answer, the copilot must call the engine (via the same Tauri commands the UI uses) and quote the result with its confidence level (Measured, Calibrated, Modeled, Extrapolated or Unknown).
2. **Nothing changes without the user's explicit click.** Every applied suggestion goes through the normal undoable edit path and appears in history.
3. **Fail closed.** If the model or provider is unavailable, or the answer cannot be grounded in an engine result, say so. Do not guess.
4. **Keys and tokens stay local** (applies once tier 3 is built), in OS secure storage via Tauri, and are never logged or sent anywhere except to the user's chosen provider.

## Proposed use cases (to prioritize)

- **Explain:** "Why is my rocket overstable?" Built from the per-component stability breakdown (`src/aero/stabilityBreakdown.ts`, `explainStability`).
- **What-if:** "What if I switch to a K motor?" Runs the case and shows deltas.
- **Fix suggestions** for failing Verify gates (tier 1 can already do this deterministically).
- **Log-format mapping (high value):** teams record flights with many devices and custom formats (AltOS primary; Featherweight, Eggtimer, StratoLogger, RRC3, Blue Raven, CATS, SRAD). The AI tier can *propose* a column/unit mapping for an unknown CSV. The user confirms it, and the import then runs through the deterministic importer with provenance (`src/evidence/logProvenance.ts`). The deterministic mapping editor itself belongs on the engine branch, since it must work without AI.

## Design questions still open
- Where the copilot lives in the workstation UI (a side panel versus a ⌘K extension). Coordinate with the frontend branch.
- How far the tier-1 assistant can go: intent matching, templated explanations, and a small curated FAQ from the docs.
- The provider abstraction (shared by tiers 2 and 3): one tool-calling interface that exposes a fixed set of engine "tools" (run case, stability breakdown, mass rollup, aero curves, sim, Monte Carlo) to whichever provider is connected.

## UI data contract
The engine branch owns `docs/ui-data-contract.md`: result shapes with confidence levels, gates, timelines and jobs. The copilot's engine "tools" should return exactly those shapes, so every number the copilot quotes carries the same confidence level and reason the UI shows.
