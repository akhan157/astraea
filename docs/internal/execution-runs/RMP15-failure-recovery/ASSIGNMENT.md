# RMP15c — actionable recovery status for failed saves/opens (RMP15-C02)

Base c9bee6c, branch execute-rmp01-package-c80e7d3 / furry-fish. Author omp
(anthropic/claude-opus-5-5); serial MiMo no-tools review. Goal increment 1.

## Finding

Fail-closed behaviour already exists and is tested (refused imports leave the
project untouched; stale saves are refused with the newer commit intact;
corrupt stored bytes are never overwritten; late flight/ensemble results cannot
touch a newer project). Missing is the *recoverable status* half of RMP15-C02:
failure messages are the raw error (`Save failed: quota`,
`Save failed: stale write rejected…`, `Open failed: Invalid project…`) and do
not tell the user that the open design is intact or what to do next.

## Change

`src/state/projectIo.ts` only: append one recovery sentence to each failure
status, chosen by error class, keeping the existing `Save failed:` /
`Open failed:` prefix and reason text:
- slot save, StaleRevisionError: another tab/window saved a newer revision;
  design still open; Save project file… keeps it, Open saved project loads the
  newer one.
- slot save, InvalidProjectError (unreadable stored copy): left untouched;
  design still open; Save project file… keeps a copy.
- slot save, other (quota/disabled storage): nothing in this browser changed;
  design still open; Save project file… keeps a copy.
- slot open failure: current design was not replaced.
- file save failure: design still open; try again or Save to this browser.
No change to what is written, refused, adopted or to file/dirty state.

## Lease

`src/state/projectIo.ts`, `src/state/projectIo.test.ts`, this directory,
coordination TASKS, RMP15 package notes. Read-only: projectStorage.ts,
projectJson.ts, store.ts.

## Verification

Red-first tests: quota failure keeps document, stored revision and dirty state,
shows guidance, retry succeeds; stale/corrupt/open/file failures show guidance.
Affected tests, tsc, Vite; bounded built-site check of one real failure (stale
save from a second tab) if feasible. Evidence:
/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp15-failure-recovery/.
