# RMP09a independent review

opencode-go/mimo-v2.6-pro / medium / no-tools, supplied text (17901 chars).
**ACCEPT**, no material findings; reviewer re-derived parallel-axis, roll and
rate chain-rule formulas; **RMP09-C01 MET** for legacy-primitive-mass-inertia/1.0.0
with declared inputs. Notes: (1) CG equality is a formula mirror — the nose-
referenced inertia check is the independent content; (2) attitude invariance —
ADDED post-review (rotated quaternion, identical mass/CG/inertia/rates);
(3) x/z label indistinguishable — ADDED code comment; (4) legacy dry-body
inertia uses centroidal cylinder formula about the declared CG without a
(cg − L/2)² correction — a model idealization, shared by code and test; realism
belongs to RMP09-C07; (5) float assert_eq brittleness; (6) pitch-rate-only
mutation not logged.
