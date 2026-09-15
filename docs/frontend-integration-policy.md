# Frontend integration policy (master decision, 2026-09-10)

- Frontend builds (Wave A/B, studios, UI work) are developed and committed
  in their worktrees (astraea-frontend, astraea-wa2, astraea-wa3, ...).
- **Main does not receive frontend changes implicitly.** The developer/user
  may continue building across multiple worktrees; integration into main is
  an explicit, user-called merge gate. Master does not auto-merge frontend
  work at delivery.
- Deliveries still REPORT to master (contract check, diff review, emitter
  registration validation, conflicts), then stay resident in their
  worktree.
- Merge trigger options: user says "merge", a named frontend release is
  declared, or a cross-cut contract decision requires main to carry it.
- Engine/evidence/scripts work (non-UI) keeps the prior integrate-on-verify
  policy unless the user says otherwise. This policy overrides the earlier
  "integration wave after delivery" sequencing for UI lanes only.

- Exception ledger + roadmap stay master-side; frontend worktree plans such
  as docs/master-contract-decisions.md (Q1-Q12) remain binding contracts.

## Research grounding (enterprise-grade bar)

- The design-research corpus (`docs/design-research/`, synthesis plus
  lane studies) and the shared research checkout (forum intel, tool
  coverage, frontend plan, contract decisions) are normative input to
  every UI delivery, not background reading. Commercial/enterprise
  quality is defined as: grounded in observed product evidence plus
  strong-model execution — neither alone passes.
- Every UI worktree delivery must cite the synthesis transferable
  patterns (§2) per pattern as ADOPT (present), ADAPT (implemented
  with stated difference), or REJECT (one-line rationale), in the
  commit message or a `docs/*-disposition.md` file. New UI without
  a disposition is incomplete by definition.
- Proposed directions are judged in the synthesis §4 order: task
  completion without coaching, engineer trust stating, state-model
  clarity, density/legibility, keyboard/zoom operability, visual
  restraint last. No representative-user claim without users.
- The coordinator verifies pattern citations and judging order
  before accepting any UI delivery, and the merge gate refuses
  uncited UI. Strong models are routed to UI/design leadership
  tracks; bulk implementation may run on faster models under the
  same citations.