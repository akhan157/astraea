# RMP10-C06 qualified output archive — assignment

- **Packet/subpacket and acceptance IDs:** RMP10-C06 (UI/export consistency), bounded consumer increment closing prior findings F1/F2/F3. No acceptance status change is claimed by the author.
- **Exact integration base SHA:** `80296584103f247614120235e3fc4c3ee08203fb`.
- **Owner / model / effort:** Pi coding agent, `openrouter/deepseek/deepseek-v4.1-flash-1017`, high reasoning. No subagents or reviewers of its own; coordinator GPT performs author-independent review.
- **Branch/worktree:** `rmp10-qualified-output-archive`, `/home/ak/.paseo/worktrees/3s8t98rp/rmp10-qualified-output-archive`. Other worktrees are untouched.
- **Source/OS/tool availability:** Linux x64, Node/pnpm and installed `node_modules`; shipped WASM is copied only if the frontend import graph requires it, never rebuilt. No Rust, native physics, engine/worker, default, threshold, or scoring change.
- **Owned existing files:**
  - `src/console/data/{adapter.ts,contract.ts,recoveryResults.ts}` and their tests.
  - `src/application/runCases.ts` and tests; new strict saved-output parser under `src/application/` and its tests.
  - `src/formats/projectJson.ts` and schema/validation tests; minimal existing schema-version fixture adjustments.
  - `src/console/stages/{SavedRuns.tsx,Build.tsx,Flight.tsx,Results.tsx,Build.tsx}` only for relevant output rendering/trace and tests.
  - Directly necessary existing shared formatting helpers (`src/console/kit/units.ts`, `Value.tsx`) only if a real gap is proven.
  - `docs/internal/output-dictionary.md`, one accurate `CHANGELOG.md` entry, and this run record directory.
- **Prohibited:** acceptance register, packet index, manifest, TASKS, GOAL-HANDOFF, coordination files, other worktrees, Rust/aero/physics/defaults, engine/worker, unrelated refactors, push/main merge/release/deploy.
- **Contracted increment:**
  1. F1: retain native `offNominalExcursion` on the console run contract, export trace and new saved records; absent old values stay unknown.
  2. F2: new optional saved-case `flightOutputs` canonical dictionary (values/units/qualification/availability/revision/flags/sampled-peak context) built from `flightOutputDictionary`, strict parser, prospective MINOR schema 1.10.0 -> 1.11.0, identity-only migration; old documents not reconstructed.
  3. F3: Saved Runs comparison shares the live unit/qualification/delta presentation policy for canonical records; summary-only records remain historical and unqualified; empty retained telemetry stays a visible state.
- **Acceptance mechanism:** red-first focused tests for lost qualification, false backfill, malformed/unknown fields, archive save-open-save fidelity, unit/availability/delta transitions, missing-vs-zero; final focused Vitest (`--maxWorkers=2` or lower), `tsc --noEmit`, Vite-only build. Logs outside git in `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-qualified-output-archive/`.
- **Reviewer and question:** coordinator GPT, independent read of diff and evidence; does the saved/trace/UI output reproduce the same canonical value, unit, qualification, availability and revision as the dictionary without inventing historic facts?
- **Resource allocation:** serial execution; `free -h` before heavy work; at most 2 compiler/test workers; no long-lived servers or browsers.
- **Evidence directory:** `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-qualified-output-archive/` plus `EVIDENCE.json` in this directory.
- **Authority:** local reversible engineering only; no publication, outreach, spend, outcome access, default switch, release or acceptance promotion.