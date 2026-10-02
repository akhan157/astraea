# Astraea interface directions

Four interactive UI/UX prototypes for the Astraea workstation, each taking a
different stance on the same end-to-end rocket pipeline (mission → airframe →
propulsion → aero → flight → recovery → verification → fabrication).

| | Direction | Stance |
|---|---|---|
| A | **Console** (`#console`) | Dense, keyboard-first mission-control workstation: ⌘K palette, scrubbable fields, live 3D viewport, persistent status rail. |
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
