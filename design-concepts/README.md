# Astraea interface directions

Interactive UI/UX prototypes for the Astraea workstation, each taking a
different stance on the same end-to-end rocket pipeline (mission → airframe →
propulsion → aero → flight → recovery → verification → fabrication).

| | Direction | Stance |
|---|---|---|
| A1 | **Console** (`#console`) | Dense, keyboard-first mission-control workstation: ⌘K palette, scrubbable fields, live 3D viewport, persistent status rail. |
| A1+ | **Console refined** (`#refined`) | A1 plus undo/redo history, deltas and a ghost outline against the last committed run, per-field revert, resizable panels, view cube, section/dimension overlays, context menu, mm/in units, typed ⌘K commands. |
| A2 | **Ribbon** (`#ribbon`) | Light parametric CAD (Fusion 360 / Onshape style): ribbon, feature browser, view cube, OK/Cancel feature dialogs, rollback timeline. |
| A3 | **Quad** (`#quad`) | Dark drafting CAD (AutoCAD / CATIA style): four synced viewports, command line with autocomplete, grips, properties palette, undo. |
| A4 | **Solver** (`#solver`) | Simulation workbench (ANSYS / COMSOL style): study tree, banded contour fields, Max/Min probes, flight timeline, solver residuals. |
| B | **Drafting Table** (`#drafting`) | The rocket as a living engineering drawing set: drag handles on a dimensioned GA sheet, calc notes in the margin, automatic redlines, revision issue flow. |
| C | **Flow** (`#flow`) | The pipeline as a node graph: visible data lineage, stale propagation downstream, cascading recompute, pluggable analysis nodes. |
| D | **Launch** (`#launch`) | Guided, cinematic studio for new builders: six plain-language steps, a copilot that proposes concrete fixes, and a watchable launch. |

All four share one design store, so a change in one shows up in the others.
Numbers come from `src/shared/model.ts`, a small Barrowman + point-mass preview
model written for these prototypes. It is **not** the Astraea engine and is not
wired to `src-tauri` or `crates/`.

## Run

```bash
cd design-concepts
npm install
npm run dev          # http://localhost:5173
SINGLE=1 npx vite build   # one self-contained dist/index.html
```

## Stack

React 19, Tailwind v4, Radix primitives (`radix-ui`), `cmdk`, `motion`,
`sonner`, `lucide-react`, three.js via `@react-three/fiber` + `drei`, `zustand`.
Charts are hand-rolled SVG in `src/shared/charts.tsx`.
