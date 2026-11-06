# Coordinator execution loop and ownership

## Start a bounded packet

1. Inspect current branch/head/dirty state, active agents/runs and package tracker.
   Claim no active work from another session. Do not reuse a historical agent as
   evidence that it is still running. No detached old automation is active.
2. Choose a ready task using `packet-index.json`. Closure dependencies block
   acceptance, not necessarily early independent design. Check actual input/source/
   OS access before promising implementation. For a blocked vendor source, work
   on strict parser contracts/fixtures only if useful; never guess real headers.
3. Write a lease with `templates/ASSIGNMENT.md`: exact current base SHA, unique
   worktree, one owner, files, dependencies, scope, tests, review and compute limit.
   Shared files have one owner. SixDof/provider/engine lib/models/DTO/schema changes
   integrate sequentially. Separate import/desktop/source docs can proceed alone.
4. Deliver a compact complete assignment prompt from the packet. Read relevant
   instructions, not every historical file or raw flight dataset. Pin base again
   after dependencies integrate; a stale assignment is not silently rebased by
   assuming compatible physical semantics.

## Models/resources

Current owner override: every delegated author, advisor or reviewer uses OMP's
direct `deepseek/deepseek-flash` provider/model selector at **max** reasoning.
Fresh catalog names that alias DeepSeek V4.1 Flash 1017; verify the version
before each dispatch. This replaces the earlier OpenRouter route/high effort,
not historical run records. The coordinating GPT retains architecture,
author-independent scientific/acceptance review and integration. A second
DeepSeek context is not different-family review; disclose that limitation.
No model name replaces source equations, runtime evidence or missing measurements.
Record actual routing and failures, not invented quota or cost savings.

Remeasure CPU/RAM/Docker limits. Historical2CPU/8GiB allowed no more than two
compute-heavy jobs totaling about6GiB; it is not a promise about the new host.
Reasoning-only review can run alongside allocated builds. Avoid simultaneous
Cargo locks/targets: assign isolated target directories when building in parallel.
No paid cloud provisioning or spending. No giant unbounded "finish everything"
agent, subdelegation without allocation, or filling all slots by default.

## Author -> review -> integrate

1. Author sends the proposed API/physics/input mapping and small commit sequence
   before material shared edits. Coordinator decides routine scope questions from
   [DECISIONS](DECISIONS.md), without re-asking owner permission already granted.
2. Implement the smallest useful end-to-end increment. No disconnected placeholder
   may be called completed integration. Keep old defaults and source identities.
3. Author executes the packet's meaningful checks on its actual source, records
   rejected inputs/failed attempts and returns `templates/RESULT.md` with hashes
   and `templates/EVIDENCE.json`. A test name/count is not proof of coverage.
4. Coordinator reads the diff and evidence, checks exact source/artifact match,
   follows failure paths, and verifies the important boundary independently.
   Material physical changes go to a reviewer independent of the author, with
   source equations, geometry/sign/normalization decisions and predicted deltas.
   Review confidence cannot replace missing measurements or access.
5. Resolve one focused rework in the same lane. Escalate a precise unresolved
   reasoning issue if it remains; do not repeatedly guess absent data. Preserve
   failed checks; never relax numerical assertions or vehicle constraints for green.
6. Integrate small reviewed commits locally with a clean known base. Resolve shared
   interfaces explicitly. Run affected integrated checks, broadening only when the
   changes/failures/concerns warrant it. Never count old results as fresh executions.
7. Accept only the bounded packet supported by evidence. Set acceptance IDs to
   pass/failed/blocked/not_applicable (with justification), not one vague "done".
   A software packet complete does not change physical qualification to PASS.

## Choosing the next action

- Accepted RMP01 native increment -> native physical review, then expand RMP06/07
  with its actual interfaces. Preserve remaining RMP01 claims as partial if only
  one subcommit is done; record the unclosed tests.
- RMP02 exact source mismatch -> document mismatch/uncertainty; select another
  eligible retained source or a justified extension; do not erase source features.
- RMP03 missing independent moment -> partial quantity support/comparison only;
  never fabricate a full load table. No actual export -> no claim of vendor support.
- RMP04 unavailable native tools/OS -> concrete block and separate platform plan;
  no mock or manually launched replacement counts as installed update/relaunch.
- Physical/data/OS/rights/owner-budget dependency -> prepare concrete request/record,
  park blocked closure and continue independent authorized work. No outreach,
  payment or unseen scoring without authorization. If nothing remains actionable,
  report the blocker once and stop repeated no-progress retries.

## Checkpoint and interruption

Write source commit, evidence paths/hashes, actual model routing, accepted/rejected
scope, limitations and exact next actions into repository-owned run records.
Update the packet tracker and lease. Record actual usage-limit message/reset
only when supplied; elapsed time does not prove reset or quota availability.

If stopped: finish no new engineering, stop running agents/compute, preserve all
tracked/untracked work, describe incomplete code and last tested source. Keep
unreviewed WIP separate from accepted integration. Do not restart or re-enable
old automation. A new session receives source, portable evidence and blockers.

No future engineering push/merge/main/tag/release/deploy is authorized by this
control loop. The current packaging update is within the owner's migration push
request. Keep reports meaningful: completed work, decisions and new blockers,
not routine retry checks or repeated permission questions.
