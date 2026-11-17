# accuracy-bundle-frontend — decisions

Kept by the frontend coordinator (thread `b1d7ce0d`). Newest last. Nothing here
authorizes a push, tag, release or deploy.

## 2026-11-11 — engine default under the opt-in bundle: option 2

**Decision (owner):** the app-bound bundle sits on today's app engine **plus the
E-1b cylinder base-drag change in its app form, `r39/e1b-continuity` `6c5d8da`**.
E-1 (the TN 3320 boattail law) stays out.

| | |
| --- | --- |
| Options offered | 1 today's app engine, no default change; 2 that plus `6c5d8da`; 3 the research engine whole, including E-1 |
| Recommended | 2 (frontend coordinator) |
| How it was given | Thread `c3a9ff51` ("Coordinate Branches Into Main"), 2026-11-11 22:55 UTC. The coordinator's summary ended "Astraea: reply 1, 2 or 3 (the frontend thread recommends 2)"; the owner replied **"Go"**. The coordinator read that as the recommended option and relayed it to this thread and to the accuracy thread. `[INFERENCE]` "Go" names no number; it is taken as the recommendation, consistent with the owner's earlier approval of the E-1b app hand-off on 2026-11-09 (`R38-e1b-backport/HANDOFF-TO-FRONTEND.md`, `R39-e1b-continuity/HANDOFF-TO-FRONTEND.md`). |
| Effect with no new option set | Estes Alpha III −0.256 m (−0.09 %), NASA Student Launch −0.232 m (−0.04 %), Spaceport America unchanged; Aero panel peak transonic Cd lower for the two cylinder-base templates. Figures from the R38 note and this lane's bundle probe; to be re-measured on the delivered engine. |
| Deliverable | The option-2 ref from the accuracy session's lane `appbound/r42-r44-r47` is the one to merge. An option-1 ref is a stepping stone only. |
| Reversible | Yes until pushed. No push without the owner's go. |

## 2026-11-11 — notes for the later `frontend/design` → `main` merge

From the cross-repo coordinator (thread `c3a9ff51`); the frontend coordinator
remains integration owner.

1. Local `main` (`35aa28a`) carried six perf-render-probe commits that were not in
   `frontend/design`. **Done:** merged as `d6a6140`; `frontend/design` is now `main`
   plus this record folder, and `src/` and `crates/` still equal `250c8f9`.
2. **Revert trap.** `frontend/design` history contains the research-branch merge
   `9adfd96` and its revert `5c95175`. A later plain `git merge accuracy/integration`
   into `frontend/design` or `main` will **not** bring the R-series content back,
   because Git treats those commits as already merged. The app-bound port avoids
   this (new commits on a branch made from `frontend/design`). If research records
   are ever wanted on `main`, they need cherry-picks or a revert of `5c95175`.
