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