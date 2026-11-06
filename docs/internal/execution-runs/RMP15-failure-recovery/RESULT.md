# RMP15c — actionable recovery status for failed saves, opens and imports

Source 75c9ea4cf3b0e1267e44657ec97306b7a1c4c2c2, base c9bee6c06c2804b8c3da999a8dd418271c34dab5. Review REQUEST_CHANGES → rework → ACCEPT.
**RMP15-C02 PASS** for current legacy model/import paths (reviewer: MET).

## Delivered
- Slot save failures name what is safe and the next step, by cause: another
  tab saved a newer revision; unreadable stored copy left untouched; other
  storage failure (quota/disabled) changed nothing. Slot open and file save
  failures likewise. Import refusals (unsupported type, malformed .rkt/.eng,
  older schema declaring newer fields) say the design (and motor catalog) was
  not changed.
- Guidance scoped to the failing call only (storage save/load; import refusals
  occur before mutation by construction).

## Evidence (external root, RAW-ARTIFACTS.json)
- before-fix 4 fail/44; rework-before 8 fail/44 (one vacuous fixture TypeError,
  then rework-before-2 genuine red); final affected-5 67 files/783 tests, tsc,
  Vite, WASM b32e7b7c… unchanged.
- Built site (managed headless Chromium): two-tab stale save refused with
  guidance, tab's edit kept, newer revision kept; malformed .rkt import shows
  guidance with design unchanged (browser-smoke-1/2.json, author-attested).

## RMP15-C02 scope
Covered: malformed import, save failure (quota/stale/corrupt/file write),
migration conflict, pending worker/late results (existing tested guards).
New provider/import/environment paths (RMP03/RMP07 integration) must re-show
this when they land. Not covered: clearing a corrupt slot in-product.
