# UP1b updater lifecycle review — 2026-10-26

Base `f07f0fb`; isolated branch `engineering/updater-lifecycle-20261026`.
Reviewed UP0 plan and UP1a RESULT under
`docs/internal/accuracy-program/first-batch-2026-10-26/` before implementation.
UP1a establishes the real native updater globals/check bridge; this change does
not reopen that investigation or qualify additional native behavior.

The user-initiated install action now synchronously guards pending installation
and requires a callable process relaunch API before any download/install action.
Missing restart support reports that installation did not happen. Browser
inertness, quiet once-per-launch offline checks, explicit install consent and
pre-install Later remain intact.

After downloadAndInstall resolves, the stored payload is cleared and the state
records the installed version as restart-required. Automatic relaunch still
follows that first successful user-initiated install. A rejected relaunch shows
that installation succeeded and offers Restart app, which only retries relaunch.
Install cannot reapply the cleared payload. Pending restart disables that action;
dismissal cannot release either pending guard. A fulfilled relaunch remains
Restarting until native exit; fulfillment alone does not prove exit/relaunch.

Validation (existing dependency symlink; no install/download):

- `node --max-old-space-size=768 /workspace/astraea/node_modules/vitest/vitest.mjs run src/desktop/updates.test.tsx --maxWorkers=1`: 11 tests passed.
- `node --max-old-space-size=768 /workspace/astraea/node_modules/typescript/bin/tsc --noEmit`: passed.
- `git diff --check`: passed.

Mocked tests cover consent/deferral, browser/offline behavior, asynchronous double
invocation during installation, busy dismissal, missing/non-callable restart API,
install rejection, applied-payload restart failure, restart-only retry and its
concurrency guard, and disappearance of the restart API after apply. These mocks
do not qualify native signatures, artifact transport, installation, executable
replacement, ACLs, signing or process exit/relaunch.

No actual artifact action, key generation, signing, native build/package, native
relaunch, production feed/key/channel/config edit, external contact, push,
deployment or spend was performed. Native apply/signature/relaunch qualification
and production channel policy remain separate reviewed work.
