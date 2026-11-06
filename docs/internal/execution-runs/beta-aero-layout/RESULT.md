# Lane beta-aero-layout — result

Status: **implementation complete, awaiting coordinator review**. The author cannot
self-accept; nothing here is an acceptance claim.

- Branch: `beta-aero-layout`
- Pin / base: `52979f12e2683c352c63d756b9d40e752a01abd0`
- Gate 1 record: `b2494d61eb8775328a8024197789a827dffc323a`
- Implementation: `65711b6ca2a71c00250370be8ed26b602bbae1df`
- Tests: `428605cc980605459653a501a928b92b9cbad388`
- Browser assertion: `9a7e7d9dcfa6070936a434c48103bfb2eb6ea394`
- Test corrections: `7c510cfa9b9b819ee0789bc09f7544e095c8c0dd`
- Report commit: this commit (`RESULT.md` + `EVIDENCE.json`)

Approval this increment implements: coordinator Gate 1 approval of option A plus
amendments 1–6. No `crates/` edit, no push/merge/release/publish.

## 1. The defect (Gate 1, unchanged)

The built-up provider returns honest totals but no labelled breakdown:
`crates/astraea-engine/src/aero_provider.rs:121-133` clears the contributions,
`crates/astraea-engine/src/models.rs:1377-1398` publishes `contributions: []` and
`breakdownUnavailable: true`. The TS adapter built `parts` only from those
contributions (`src/console/data/adapter.ts:241`), so `layoutFrom` fell back to
`length = 1` with zero parts and every surface that reads the layout collapsed.

Measured at the pin with the real WASM engine (`gate1-probe.json`), NASA Student
Launch preset:

| | legacy | beta 1.1.0 |
|---|---|---|
| contributions | 7 | **0** |
| layout length / parts | 2.97 / 7 | **1 / 0** |
| CG (m) | 1.7972237541913614 | 1.7972237541913614 |
| CP (m) | 2.409174961652899 | **2.4181789584971094** |
| margin (cal) | 4.025994785931167 | 4.085231607274658 |

The CP/CG markers were already the selected model's own values; only the shape
was missing. Browser evidence at the pin (`gate1-browser-default.json`):
`data-layout-length` 2.97 → **1** → 2.97, marker CP 2.4092 → 2.4182 → 2.4092.
The same probe on Estes Alpha III: 0.476 → 1 → 0.476.

## 2. What changed

### One model-independent geometry source

`src/console/hooks.ts` — the content-keyed stability entry now also carries the
native geometry+mass rollup (`VehicleMassRollup` from `aggregate_mass`):

- It is requested only after a stability result lands with `parts.length === 0`,
  i.e. exactly the provider path; the legacy path never triggers a second call.
- Key and bound: the existing stability key
  `${contentKeyOf(vehicle)}|${aeroModelKey(aeroModel)}` and the existing
  `STABILITY_CACHE_LIMIT = 48` LRU (in-flight and rendered entries are never
  evicted). There is no second cache to bound.
- Coalescing: the geometry request is chained to the stability dispatch, so it
  inherits the existing leading+trailing 120 ms pump and one-call-in-flight rule.
  A slider drag produces one geometry call per **landed provider result**, never
  one per step. Tested with eight rapid vehicle keys: stability ≤ 2, geometry ≤
  stability, geometry < steps.
- Failure: `aggregate_mass` rejection is recorded as `geometryError` and never
  turns the stability result into an error.

`src/console/viewport/Vehicle3D.tsx`:

- `layoutFrom(stability)` and the new `layoutFromGeometry(rollup)` now share one
  `layoutFromParts` implementation, so length, part stations, radius and the
  `length > 0 ? length : 1` fallback are identical for both sources.
- `useLayoutSnapshot` uses the selected model's parts when it publishes them;
  otherwise it uses the geometry rollup. Until that rollup exists the snapshot is
  `null` and the existing last-ready snapshot stays on screen (or the honest
  empty state on a fresh load). Markers still come from `snapshot.breakdown`, so
  the beta CP is 2.41818 m and is never replaced by the legacy CP.
- The motor mount station is now `motorAftStation(vehicle, layout)` (exported for
  testing): last motor-mount tube → last body tube → layout end; `null` when the
  vehicle has no body tube, instead of an invented placement.

`src/console/viewport/Viewport.tsx` — the existing probe div gains
`data-layout-parts` (part count, numbers only) beside `data-layout-state`,
`data-layout-length`, `data-markers`, `data-marker-cg` and `data-marker-cp`.

No adapter/contract semantics changed, no Aero-table rows were invented, and the
Aero panel keeps its existing "component breakdown unavailable inside the band"
wording with an empty row set under beta.

The 2D drawing, parts tree, camera framing/silhouette, section seams, bounds and
motor placement all read the same `useLayout`/`useLayoutSnapshot`, so they are
fixed by construction; each is covered by a test below.

## 3. Affected surfaces and their tests

| Surface | Test | Assertion |
|---|---|---|
| 3D viewport | `src/console/viewport/betaSurfaces.test.tsx` | `data-layout-parts="7"`, length 2.97, state ready, markers present, CG 1.79722, CP 2.41818 and ≠ 2.40917 |
| 2D drawing | same file | `L 2,970 mm` dimension, ≥ 3 body-tube rects and the nose outline as direct SVG children |
| Parts tree | same file | header `7.00 kg`, every row mass `1.00` (the pin showed `0.00` / 0 kg) |
| Framing/silhouette/bounds/seams | `src/console/data/geometryParity.test.ts` | geometry and legacy layouts produce identical silhouette points, `vehicleBounds` and `sectionJoints` |
| Motor station + fallback | same file | mount end from the layout, layout-end fallback when the part is absent, `null` without a body tube |
| All three presets | same file | `aggregate_mass` stations/CG/mass equal the legacy layout parts: Estes Alpha III, NASA Student Launch, Spaceport America (exact stations, CG/mass to 1e-12) |
| Coalescing / failure path | `src/console/viewport/betaLayout.test.tsx` | eight-step drag ≤ 2 stability and ≤ that many geometry calls; rejected rollup keeps the last layout; a fresh failed load stays empty |

The parity test is the guard for the two-rollup risk: `stability` uses
`crates/astraea-core/src/aero.rs:662` and `aggregate_mass` uses
`crates/astraea-core/src/mass.rs:570`; all three presets agree exactly.

## 4. Falsifier

Test: `src/console/viewport/betaLayout.test.tsx`, first case — real WASM engine
behind the bridge, `useLayoutSnapshot(PRESET_NASA_STUDENT_LAUNCH, beta)`:
length 2.97 (±1e-9), 7 parts, `nsl-bt2 = {1.52, 2.97, 2.245, 4.380100761919091}`,
breakdown CG 1.7972237541913614, CP 2.4181789584971094 (≠ legacy).

At the pin (temporary worktree at `52979f1`, same test file, same wasm bytes
`sha256 1248b7bf…`; `git diff 52979f1..HEAD -- crates src/engine` is empty):

```
git worktree add /tmp/opencode/beta-aero-pin 52979f1
cp <lane>/src/engine/astraea_engine.wasm /tmp/opencode/beta-aero-pin/src/engine/
cp <lane>/src/console/viewport/betaLayout.test.tsx /tmp/opencode/beta-aero-pin/src/console/viewport/
cd /tmp/opencode/beta-aero-pin
node_modules/.bin/vitest run src/console/viewport/betaLayout.test.tsx \
  -t "lays out the vehicle from model-independent geometry" --maxWorkers=2
```

→ **fails** at the pin, exit 1:
`AssertionError: expected 1 to be close to 2.97` (`falsifier-at-pin.log`).

After the fix, in the lane tree:

```
node_modules/.bin/vitest run src/console/viewport/betaLayout.test.tsx \
  -t "lays out the vehicle from model-independent geometry" --maxWorkers=2
```

→ **passes**, exit 0 (`falsifier-after.log`).

Browser assertion (added only to `scripts/preview-journeys.mjs`): Aero →
Aerodynamic inputs, on the default NASA preset. It waits for the legacy CP
(2.40917), ticks beta, waits for the beta CP (2.41818) and then asserts length
≈ 2.97, parts = 7, CG unchanged, CP ≠ legacy; untick restores the legacy values.
At the pin the same check fails on `data-layout-length` = 1 (browser probe); the
`data-layout-parts` probe attribute did not exist.

## 5. Verification actually run (at `7c510cf`)

| Command | Result |
|---|---|
| `npx vitest run --maxWorkers=2` | **exit 0** — 159 files, 1892 tests, 157.55 s (`full-vitest.log`) |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` | **exit 0**, `✓ built in 845ms` (`build.log`) |
| `pnpm test:browser` | **exit 0**, 36 acceptance lines; `Preview acceptance passed: beta aero model: full rocket stays laid out; CP stays the model's own` (`test-browser.log`) |

`pnpm test:browser` ran the built app under the production CSP in Chromium with
software GL, including all existing journeys, the preset software checks, the
calibration and share-flight journeys. No images were read or written by this
lane; every assertion used DOM attributes, JSON or printed numbers.

## 6. Upstream engine follow-up (option E — recorded, not implemented)

The clean long-term fix belongs in the engine, not the app:

1. Add the per-component axial extents (id, axialStart, axialEnd, cg, mass) to
   the provider stability DTO from the existing rollup, so a provider result is
   self-sufficient and the app needs no second `aggregate_mass` call.
2. Make `stability` and `aggregate_mass` share one rollup implementation; today
   `aero.rs` keeps a private copy and `mass.rs` a public one. The parity test
   would then guard a single source rather than two.

Both are engine changes and are out of scope for this lane per the brief; no
`crates/` file was touched.

## 7. Deliberately not done / limitations

- The Aero breakdown table stays empty under beta with its existing honest note;
  no rows or per-part aero numbers are invented.
- Marker values are exactly the selected model's totals; the beta CP moves
  2.4092 → 2.4182 m and is not substituted.
- A failed geometry rollup is not retried until the stability entry is evicted
  or the vehicle changes, matching the existing stability-error policy.
- During a model switch the last ready snapshot keeps its own breakdown markers
  until the new result (breakdown + geometry) lands — the established keep-last
  behaviour from `live-sizing-fix`, including when the rollup fails.
- The geometry request is made once per landed provider stability result even if
  no viewport is mounted; it is a cheap cached command and keeps the request
  coalesced with stability rather than adding a second request pump.
- No acceptance-register entry was changed; this lane has no register row.

## 8. Stop state

Working tree clean at this report commit; no push, merge, tag, release or
publish. Waiting for coordinator review; the author cannot self-accept.
