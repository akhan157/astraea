# Lane result: doc-claims

## State

- Pin: `89fc995` (`docs(doc-claims): lane assignment`), branch `doc-claims`
  (renamed from the T3 worktree branch `t3/doc-claims`).
- Implementation commit: `4394e4c` (`docs(doc-claims): correct the 7 flagged
  public-doc claims`).
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.
- Approval: owner decisions relayed by the coordinator on 2026-11-07. Claim 1
  is option A (keep the dated row and add the paragraph); claims 2, 3a, 3b, 4,
  5 and 6 as proposed; claim 7 the exact new eyebrow string.
- Status: **in_progress — implemented and checked, awaiting coordinator review**.
  The author did not self-accept, push, merge, tag, release or publish.

## Approved scope delivered

Exactly the 7 claims, no other public wording:

| Claim | File (line before the edit) | Change |
|---|---|---|
| 1 | `docs/road-to-1.0.md:72-73` | Kept the dated 2026-10-22 row and added the approved paragraph after the table: the 2026-10-30 Windows 11 VM check installed and launched a fresh 0.9.0 package with no blank WebView, ran a flight under the production CSP and saved/opened a project; the 0.10.0 rebuild installs, launches and runs the sample (2026-11-02); signed upgrade, hardware-GPU, accessibility and migration/recovery checks remain open. `README.md:146-148` unchanged. |
| 2 | `docs/road-to-1.0.md:3` | "Astraea 0.9 is a beta" -> "Astraea 0.10 is a beta". |
| 3a | `CHANGELOG.md:120` | Added "; not published, superseded by 0.10.0" to the 0.9.0 intro. |
| 3b | `CHANGELOG.md:303-304` | "which ships the same features as a beta" -> "which was planned to ship the same features as a beta". |
| 4 | `CHANGELOG.md:315` | Qualified the signed-updates bullet: signature verification was exercised only with a local fixture key; no production signing key or public feed was established. |
| 5 | `docs/accuracy.md:43` | The G69N row now says the +32 % is after the missing fin edge drag was found and fixed. |
| 6 | `docs/flight-validation/README.md:13` | "Current production replay (2026-10-20)" -> "(2026-10-21)". |
| 7 | `index.html:37` | Eyebrow is now "Free · Beta %APP_VERSION% · Browser, Windows and Linux · macOS pending". |
| 7 (test expectation) | `scripts/preview-journeys.mjs:114` | Updated only the expected eyebrow string to match. This is the approved conditional change; nothing else in the journey was touched. |

The landing page still injects the package version at build time; the built
`dist/index.html` contains `Free · Beta 0.10.0 · Browser, Windows and Linux ·
macOS pending` and no `%APP_VERSION%` token.

## Checks

1. `pnpm install --frozen-lockfile` — pass (280 packages, lockfile policy
   verified, 966 ms).
2. `pnpm build:engine` — pass (release profile, WASM written; 1 m 03 s cold).
3. Link check with the `public-docs-audit` checker
   (`/tmp/opencode/public-docs-linkcheck.mjs`, outside the repo) over the same
   22-file set — **150 links checked, 0 broken**.
4. `npx vitest run --maxWorkers=2` — **pass: 166 test files, 1,951 tests,
   340.74 s**. The count is above the audit's 165/1,947 because later
   `layout-polish` commits added tests; no test was skipped or changed by this
   lane.
5. `pnpm build` — pass (`tsc` and Vite production build). Built landing page
   checked for the new eyebrow and version substitution.
6. `pnpm test:browser` — pass. Chromium under the production CSP reported the
   533 m baseline and every preview/depth/calibration/share journey passed,
   including the landing-page eyebrow assertion with the new platform list.
7. `git diff --check` — clean.

## Deliberately not done

- `README.md:146-148` was not changed, per the owner's option A decision.
- No changes outside the 7 claims. The only non-public-doc edit is the landing
  journey's expected eyebrow string, required by the owner's conditional.
- No `docs/internal/` records, tests, fixtures, schemas, thresholds or images
  were modified.
- No image or screenshot was opened, read or attached.
- No push, merge, tag, release, publish or external contact.

## Notes for the coordinator

- The 2026-10-30 Windows record is a partial installed acceptance: it leaves
  signed upgrade, hardware-GPU, accessibility and migration/recovery open, and
  the package is unsigned and not a release candidate. The new paragraph says
  exactly that and does not upgrade any status.
- The 0.10.0 rebuild did not re-exercise CSP, persistence or the
  uninstall/offline cycles in the VM; save/open for that build was browser-only.
  The README was left as the owner directed, so this remains a known scope
  boundary rather than a claim made by this lane.
- The author cannot self-accept. This file and the implementation are for
  coordinator review; the lane is not merged, pushed or released.
