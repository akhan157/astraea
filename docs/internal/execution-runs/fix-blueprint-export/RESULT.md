> Moved 2026-11-14 from the repo-root `RESULT.md` (main @ `a57a7c8`, lines 237–254) during owner-approved tidy-up. Text unchanged.

# Blueprint export — author report (not self-accepted)

Base: `250c8f9f478591a9f981a10a2f96e7ad45829031`. This report and implementation are in the same commit; use `git rev-parse HEAD` for its SHA. Independent review and acceptance remain with the orchestrator.

Root cause: the drawing uses a positive centerline `cy`, but the SVG viewBox and background started at `-cy`. The lower drawing and dimensions consequently fell outside the viewBox. Fin tips and text can also extend past the nominal body dimensions.

Fix: bound the actual shape geometry, Bézier control points and conservative text extents, with outward rounding and margins. Apply those bounds to the background, grid and SVG intrinsic dimensions. PNG uses the existing rasterizer and inherits the SVG dimensions. No visual palette or label changes.

Evidence:
- `free -h`: 6.1 GiB available before final test run.
- `npx vitest run src/formats/blueprintBounds.test.ts --maxWorkers=2` on the base implementation with the new regression: exit 1, 9 of 9 cases failed; NASA grid extended beyond the viewBox. The test parses rects, paths, polygons, lines and conservative text boxes for all presets and unusual vehicles.
- `npx tsc --noEmit`: exit 0.
- `npx vitest run src/formats --maxWorkers=2`: exit 0, 14 files and 234 tests passed. Earlier full runs failed on old viewBox expectations; those expectations were corrected to match the new coordinate system.
- Generated `out/blueprint-nasa.svg` and `out/blueprint-nasa.png` (light theme). PNG generated in headless Chromium using compiled `renderBlueprintPng`; `file` reports 940 × 246 pixels. SVG SHA-256 `0c932b9f17ff973ede0c7f1e2ad064626ab497667df0d0018252b92b5404c51f`; PNG SHA-256 `df7f952576aeb84c20bc69c8c85687f24352306b3ac7cfa2eb518bd6508126dd`. Outputs are ignored and not committed.
- `git diff --check -- src/formats/blueprint.ts src/formats/blueprint.test.ts`: exit 0.

Limits: text bounds estimate monospace glyph extents conservatively; the orchestrator should inspect the generated image and independently review the implementation. Fin-only designs remain invalid because the exporter requires an enclosing body tube; the regression covers fins extending beyond the body. No engine artifact, dependency tree, assignment, records or other exports were committed. No push performed.
