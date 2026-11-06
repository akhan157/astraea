# Third-party notices and bundled-rights inventory

Engineering inventory for RMP18-C03 (rights/notices/private boundary). It records
what the shipped browser/desktop frontend actually contains, which licence texts
accompany it, and which rights are **not** evidenced. It is not legal sign-off,
not a release authorization, and it grants no permission.

## Delivered notice file

- `public/third-party-notices.txt` — shipped by Vite to `dist/` and embedded in the
  desktop bundle. Sections: first-party Apache-2.0 text; bundled fonts (OFL-1.1,
  verbatim licence plus copyright lines); JavaScript dependency texts, grouped by
  identical content; WebAssembly engine crate texts; unresolved evidence.
- Access: landing footer (`index.html`) and the Model & evidence status panel
  (`src/console/evidence/ModelStatusPanel.tsx`) link to it. Relative paths keep it
  reachable from `/` and `/app/` under subpath hosting and the Tauri custom
  protocol. No CSP, capability or dependency change is involved.

### Generation and drift control

```
node scripts/third-party-notices.mjs           # regenerate
node scripts/third-party-notices.mjs --check   # exit 1 when the committed file is stale
```

The generator reads only this workspace and locally installed packages plus the
local Cargo source cache. No network, no new dependency, no scanner service.
Output is deterministic: all lists are sorted by code unit, entries are grouped by
SHA-256 of the exact licence text, and the file contains no timestamp, date,
absolute path, machine name or user name. The generated file is committed; the
check mode fails with the first differing line so drift cannot pass silently.
Regeneration needs `pnpm list` and the Cargo registry sources for the engine lock;
without them the generator fails rather than emitting an incomplete file.

## Surface and rights inventory

| Surface | Content | Rights status |
| --- | --- | --- |
| First-party app/website/engine | Apache-2.0 (`LICENSE`, `package.json`, crate manifests) | Verified locally; full text shipped in the notice file |
| Fonts | `@fontsource/space-grotesk@5.3.0`, `@fontsource/jetbrains-mono@5.3.0`; 51 binaries in `dist/assets` (all subsets, woff + woff2) | Verified OFL-1.1; both copyright lines and licence texts shipped verbatim |
| JavaScript dependencies | 170 production-closure packages; 7 are `@types/*` declarations with no runtime code; 163 runtime candidates | 153 packages have a local licence text, reproduced in 70 distinct texts; 8 have no local text (below). The notice file is a superset of any tree-shaken bundle |
| Engine WebAssembly | Built from `crates/astraea-engine` + 21 non-workspace lock crates | All 21 local texts reproduced (14 distinct); declared identifiers listed per crate |
| NASA CEA thermodynamic data | `crates/astraea-core/data/thermo-propellant.inp`, compiled into the WASM | Provenance documented; redistribution terms **not established** |
| Validation motor curves | `src/validation/round2/motorSources.generated.ts` (RocketPy MIT header) | Not in the browser bundle; manufacturer curve rights **not established** |
| Landing images | 6 WebP screenshots | No provenance record; **unverified** |
| Desktop native binary | 472 third-party crates from `src-tauri/Cargo.lock` | **Not enumerated**; no installer is published |

## Unresolved items (no right asserted)

| Item | Why unresolved | Responsible role | Reopen when |
| --- | --- | --- | --- |
| `@mediapipe/tasks-vision@0.10.17` (Apache-2.0) | no licence file in the installed package | dependency/artifact owner | before public distribution, or when the pinned tarball/licence text is available offline |
| `@nodable/entities@3.0.0` (MIT) | same | dependency/artifact owner | same |
| `@react-three/fiber@9.8.2` (MIT) | same | dependency/artifact owner | same |
| `draco3d@1.5.8` (Apache-2.0) | same | dependency/artifact owner | same |
| `isarray@1.0.0` (MIT) | same | dependency/artifact owner | same |
| `maath@0.10.8` (MIT) | same | dependency/artifact owner | same |
| `react-remove-scroll-bar@2.3.8` (MIT) | same | dependency/artifact owner | same |
| `stats-gl@2.4.2` (MIT) | same | dependency/artifact owner | same |
| Desktop native closure (472 crates) | licence texts are not in the offline cache; no installer is distributed | native build owner | before building or publishing any installer |
| NASA CEA data subset | redistribution terms not documented here | scientific/source custodian + release authority | before publishing the WASM-bearing site or app |
| Manufacturer thrust curves | rights in the `.eng` sources not established | data custodian | if the repository is published or the harness data is bundled |
| Landing WebP provenance | no author/source record | owner | before public site publication |

`webgl-constants@1.1.1` declares no SPDX field, but its installed `LICENSE` is the
standard MIT text; the notice file records "no SPDX field" and includes that text.
That is evidence of the shipped text, not of a completed licence audit.

## Which "no licence file" packages are actually distributed

The notices generator lists every package that declares a licence but ships no
licence file. That list is an inventory statement, not a distribution claim: the
production bundle tree-shakes some of them out. Checked against the built bundle
for engine `1ccea732…` (site built from the same source, searching every
`dist/assets/*.js` for each package's own banner/identifier):

| Package | Declared | Shipped in `dist` | Note |
| --- | --- | --- | --- |
| `@react-three/fiber@9.8.2` | MIT | **yes** (its banner object is in the three chunk) | `package.json` gives `author: Paul Henschel`, repository `pmndrs/react-three-fiber`; upstream ships no licence file |
| `@mediapipe/tasks-vision@0.10.17` | Apache-2.0 | no | not referenced by the bundle |
| `@nodable/entities@3.0.0` | MIT | no | not referenced by the bundle |
| `draco3d@1.5.8` | Apache-2.0 | no | not referenced by the bundle |
| `isarray@1.0.0` | MIT | no | not referenced by the bundle |
| `maath@0.10.8` | MIT | no | not referenced by the bundle |
| `react-remove-scroll-bar@2.3.8` | MIT | no | not referenced by the bundle |
| `stats-gl@2.4.2` | MIT | no | not referenced by the bundle |

Method and limits: the search matches each package's name string in the emitted JS;
a package could in principle be bundled under a minified identifier without its
name appearing, so "no" means "no evidence of distribution in this build", not a
proof of absence. Re-run the search whenever the bundle changes. The one package
that does ship still needs its licence text reproduced with a copyright line; the
upstream package does not provide one, so the honest record is its declared
identifier, author field and repository rather than a fabricated copyright notice.

## Licence election

`jszip@3.10.1` declares `(MIT OR GPL-3.0-or-later)`. Distributing it under **MIT**
is this project's election permitted by that SPDX expression. It is a licence
choice, **not** legal review or sign-off; the notice file reproduces both texts as
shipped.

## What this does not establish

- No legal approval, compatibility analysis or sign-off for any dependency or data
  set.
- No installed-Tauri or native runtime acceptance; the desktop native closure is
  not enumerated.
- No redistribution right for the NASA CEA subset, manufacturer thrust curves or
  landing imagery.
- No claim that a published site or installer exists; deployment state is external.

Reopening triggers are the table above; any new dependency, font, data file or
bundle change requires `node scripts/third-party-notices.mjs` and the committed
file must pass `--check` before distribution.
