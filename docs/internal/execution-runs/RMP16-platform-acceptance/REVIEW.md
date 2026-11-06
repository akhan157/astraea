# RMP16 Windows run — independent review

Reviewer: independent reviewer agent `RMP16Review` (fresh context, read-only),
2026-10-30. The coordinator executed the run and wrote the receipt; this review is
the independent acceptance record required because the author cannot accept their
own work.

## What the reviewer verified from the raw files

- The quoted NSIS, MSI, installed-exe and uninstaller hashes match
  `raw/bundle-hashes.txt`, `raw/build-transcript.log` and
  `raw/install-transcript.log`; the registry shows 0.9.0 and WebView2 is
  156.0.4314.50.
- Both smoke reports match the evidence exactly (apogee 533.0760350112048,
  67.85318210601588 s, Mach 0.29117949481819017, rail exit 18.89868968377279,
  touchdown, `ok: true`, `validity: PASS`, WASM worker, zero page errors); the
  offline launch is a genuinely separate run.
- The startup trace matches the quoted stages (window built 421 ms, page load
  finished 702 ms, `document_init` 861 ms, `DOMContentLoaded` 1043 ms, `load`
  1495 ms, `root_present_5s` 5552 ms).
- The source reconciliation is correct: 1181 tracked paths, 1180 identical, one
  generated schema differing; both manifest hashes match the stored files.
- The screenshots show the claimed states (valid run, save dialog, reopened
  project, run result).
- The build transcript's pubkey decodes to fixture key id `AE852B5B80C0C890`,
  not the production `6E9A273894277E80`.

## Verdicts

| Check | Verdict | Basis |
| --- | --- | --- |
| RMP16-C01 | **accept-pass, NSIS only** | source manifest + NSIS hash + install manifest reconcile the tested package; the MSI is built but excluded from this pass |
| RMP16-C02 | **accept-pass on the retained-gap limb** | the packet says "cause supported **or** exact external gap retained; no guessed fix"; the historical `2f28c65` blank WebView was not reproduced (package and machine unavailable), the gap is retained, and no source fix was guessed. This is a diagnosis-gap pass, not startup closure |
| RMP16-C03 | **blocked** — the proposed "only signed upgrade remains" narrowing was rejected | the signed-upgrade blocker is genuinely external, but local receipts were missing at review time; after the reviewer's findings they exist (save bytes/hash/content, offline firewall apply/remove, the raw offline exit receipt, MSI install), while the signed upgrade still does not |
| RMP16-C05 | **blocked** | uninstall now has a receipt, but the declared uninstall data policy, post-uninstall user-project retention check and the renderer context-loss exercise are still missing |
| RMP04-C01 | **blocked, rationale refreshed** | a Windows product build exists but the guard matrix and the release build-config review are still unexecuted; the Windows MSI/NSIS build does not satisfy it |

## Claims the reviewer rejected in the first draft, and how they were resolved

1. **Uninstall claimed clean with no receipt** — re-ran the NSIS cycle with
   `raw/nsis-cycle.txt` (exit 0, directory/registry state), and added the MSI
   install/uninstall cycle with its logs.
2. **Save path/size/hash/content and browser-slot status asserted without a raw
   receipt; the Save As screenshot showed the default name** — added
   `raw/screen-w25-typed-save-path.jpg` (path typed in the dialog),
   `raw/saved-project.txt` (guest size+hash), `raw/saved-project-summary.txt`
   (schema, revision, vehicle, components, case kind, flight outputs) and
   `raw/screen-w20-slot-status.jpg` (slot revision 1).
3. **Offline firewall state unrecorded** — recreated the rule with
   `raw/offline-firewall.txt` (rule listed enabled/outbound/block, then removed,
   0 remaining) and captured `raw/offline-exit2.txt` (exit=0) with a fresh smoke.
4. **Build-tree exe hash / three-byte diff unsupported** — added
   `raw/build-tree-exe.txt` and `raw/exe-byte-diff.txt` (offset 13,306,323,
   `__TAURI_BUNDLE_TYPE_VAR_UNK` → `…_NSS`).
5. **"Reproduced: false" overstated** — changed to "reproduction not attempted;
   exact reproduction unavailable".
6. **Schema-origin attribution unsupported** — corrected to "generated file
   refreshed by the build; committed copy is stale relative to the other
   generated schemas", without the Linux-origin claim.
7. **MSI not installed** — MSI install/uninstall cycle recorded.
8. **Teardown stderr, CSP-count basis and thin build transcript** — disclosed in
   `EVIDENCE.json` and `RESULT.md`; the build script is attached.

## Recorded dispositions

- C01 `pass` with `reviewDisposition: approved`, evidence path this directory.
- C02 `pass` with `reviewDisposition: approved`, evidence path this directory,
  disposition naming the retained historical gap (2f28c65 package and the
  original observation machine) and that no cause was guessed.
- C03 `blocked`: external signed-upgrade authority/feed plus the remaining local
  MSI-independent legs are now receipted; the recorded blocker is the signed
  upgrade only, with the declared data-policy leg listed under C05.
- C05 `blocked`: uninstall receipted; data policy/retention and context-loss
  remain.
- RMP04-C01 stays `blocked` with the refreshed rationale (guard matrix plus
  release build-config review unexecuted; the Windows build does not satisfy it).

## Confirmation round (same reviewer, after the receipts were added)

The reviewer re-checked only the rejected items and answered:

1. **Uninstall receipts — CONFIRM.** `nsis-cycle.txt`/`msi-cycle.txt` support the
   clean-uninstall claims for program files and registry. C05 remains blocked on
   the declared uninstall data policy, the post-uninstall user-project/browser-slot
   retention check, and the renderer context-loss exercise.
2. **Offline receipt — CONFIRM in substance, CORRECT-WITH wording.** The rule
   output has no Program/ApplicationFilter, so the claim must be "an enabled
   outbound block rule was active", not "scoped to the installed exe". Applied:
   `EVIDENCE.json` and `RESULT.md` reworded.
3. **Save/slot chain — CONFIRM.** Guest and host hashes match; the 4.8 MB file is
   not stored in the repository, which is consistent with the hash-not-artifact
   principle. "Reopened at the same path" corrected to "the same file name".
4. **C03 — CONFIRM "signed upgrade only"** once the offline wording is fixed.
   The signed-upgrade blocker is the only remaining C03 gap; the data-policy and
   context-loss legs belong to C05.
5. **C02 — CONFIRM** the retained-gap pass with the corrected "reproduction not
   attempted" wording.
6. **Receipt hygiene — CORRECT-WITH.** `raw/build-script.ps1` contained the
   ephemeral fixture-key password. Redacted to
   `<ephemeral-fixture-password-redacted>`; the private key was never copied off
   the guest and the password is not reused anywhere.

Residual minor wording fixed in the same pass: the interactive exit 0 is labelled
a session record (the raw exit receipt is the offline relaunch), the run is
described as "triggered in the app" rather than naming a key chord, and the
reopen is described as a fresh app session.

## Third round — C05 adjudication

The reviewer adjudicated the renderer-loss and uninstall-retention receipts:

- **RMP16-C05 — ACCEPT-PASS.** A forced `WEBGL_lose_context.loseContext()` in the
  live installed page produced the labeled fallback with the tree and metrics
  live; "Restore viewport" brought the canvas back. The declared `DATA-POLICY.md`
  is matched by `raw/retention-cycle.txt` (project file sha unchanged, program
  dir/registry gone, profile dir present) and by the slot reopening as revision 1
  after reinstall. It required the disposition to retain the limits: software
  WebGL only (no hardware driver reset), the profile path is the declaration,
  `raw/webgl-loss.json` is a step summary rather than a CDP transcript, and the
  "no hidden copies" statements are declared policy rather than a filesystem
  search.
- **RMP16-C03 — confirmed unchanged**, still blocked on the owner-authorized
  signed upgrade only.
