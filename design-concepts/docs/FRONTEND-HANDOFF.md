# Frontend direction: handoff

**Date:** 2026-10-03. **Branch:** `claude/upbeat-allen-ol4h5e`. **Scope:** the workstation UI/UX direction only. Engine, validation and copilot work were split to `claude/engine-validation-roadmap` and `claude/copilot-experimental`; each has its own handoff in `docs/handoff/` on its branch.

## What exists here
- `design-concepts/` is a standalone Vite + React 19 + Tailwind v4 prototype app. Run it with `cd design-concepts && npm install && npm run dev`, or build one self-contained HTML file with `SINGLE=1 npx vite build`. See `design-concepts/README.md`.
- Hash routes: `#refined` (A1+), `#console` (A1), `#ribbon` (A2), `#quad` (A3), `#solver` (A4), `#drafting` (B), `#flow` (C), `#launch` (D). The root route is a hub page.
- **Published artifact (owner's private link):** https://claude.ai/artifact/PRkj5qixU4Ri4AhAGanuTQ. Republish by building the single file, stripping the `<!doctype>/<html>/<head>/<body>` wrapper and the charset/viewport metas, then publishing to that URL. Read it first from a new session.
- **Numbers in the prototypes come from `src/shared/model.ts`,** a small Barrowman + point-mass preview model. It is **not** the Astraea engine.
- `docs/screenshots/` holds the fold-in reference shots (0 = A1+ base, 1 to 5 = the pieces to fold in, each shown in its source prototype).

## Decisions made with the owner
1. **The direction is Console.** It "feels the most like engineering software / CAD." Within the Console family, **A1+ (Console refined) is the base.** Reasons: the pipeline stage rail is its spine, it makes result freshness and trust explicit (committed vs preview, amber changed markers, deltas vs the last run, a ghost outline of the committed design), and it suits both newcomers and keyboard power users.
2. **Fold into A1+:**
   - **From A4 Solver:** the results-tree, details-pane and flight-timeline scrubber pattern, for the Aero and Flight stages, showing **only real engine data**.
   - **From A3 Quad:** a typed command mode in ⌘K (A1+ already accepts `span 120` and `K550W`), plus an optional 2D front/top/aft split view in Airframe for exact dimensions.
   - **From C Flow:** a **read-only** "what depends on this" view that explains why results went stale.
   - **From D Launch:** guided first-run onboarding (the six steps) and a copilot *panel* placement. The copilot's behavior is defined on the copilot branch.
   - **From B Drafting:** outputs only. Drawing sheets are **not** a workspace (see 4).
3. **No fluff (hard rule).** Show nothing the engine does not compute. **Removed:** the A4 surface color maps (pressure, temperature, stress) and the fake solver residual plot. The real engine has no distributed surface fields, and the 6-DOF solver is time-marching with no residuals.
4. **Fabrication and export.** Astraea works like OpenRocket/RASAero: a parametric part tree is the source of truth, and the 3D view is derived from it. Export is the exit at the end of the loop (import or template → tweak → simulate → export). STEP and STL import are **not** wanted (meshes carry no parameters). The UI needs one **Export panel in the Build stage** with a pre-export check: revision, whether the sim is current, gate states, and confidence levels. It writes a small trace/manifest file with each export (the owner liked the traceability). The 1:1 fin DXF and cut-list CSV are optional. Starting templates (presets) stay as the "start from a popular example" path.
5. **Graded confidence (the "in-between").** Results carry a level: Measured, Calibrated, Modeled, Extrapolated or Unknown. The owner wants it **subtle, not a flag on every number.** The UI treatment is still an open design problem for this branch; the engine branch will supply the levels and reasons.

## Real-data views (topic 3, awaiting owner sign-off)
Proposed first set, all backed by real engine output:
- **Flight timeline** (Flight stage): events strip (liftoff, rail exit, burnout, max-Q, apogee, drogue, main), stacked altitude / speed / Mach / angle-of-attack plots, and a scrubber that poses the 3D rocket at that moment. Source: 6-DOF output.
- **Stability breakdown** (Aero stage): per-component CNα and CP contribution as a list; hovering highlights the part in 3D. No surface coloring. Source: `explainStability` (`src/aero/stabilityBreakdown.ts`).
- **Fin flutter margin:** a Verify gate, the value in the fin inspector, and a margin-vs-time curve (the worst point is usually around max-Q). Note: NACA TN-4197 depends heavily on the composite shear modulus, so show that dependency and allow a user override (engine branch E6).
- Already present: mass/CG per part (A1+ mass budget). Later: fin structural loads, as numbers.

## Still to discuss (in order)
- Topic 3: sign-off on the views above.
- Topic 4 (motor design) and topic 5 (verify vs calibrated model) are mostly engine topics, now on the engine branch. Their **UI** parts stay here: a Motor stage with "pick from catalog / import / design your own", a propellant recipe editor screen, a static-fire import, and Verify (requirements gates) visually distinct from Validation (model vs real flight).
- How to show confidence levels subtly.
- Then build a merged A1+ prototype with the fold-ins, and later port the chosen direction into the real app (`src/components/`).

## Known prototype notes
- drei `<Html>` overlays drop sibling labels under React 19, so `src/shared/Anchors.tsx` (`Projector`) is used instead. Never pass an inline `style` object to `<Html>`.
- StrictMode is disabled in `src/main.tsx` for the same reason.
- `useDesignStore` keeps undo history (rapid same-field edits merge into one entry) and a `simDesign` snapshot for deltas and the ghost.
