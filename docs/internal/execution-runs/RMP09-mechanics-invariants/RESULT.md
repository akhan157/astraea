# RMP09a — legacy mechanics invariants, RMP09-C01 PASS (legacy model, declared inputs)

Source a47bcb51d9225651782a6dc35e3953335b99c8df (tests only), base 822db11563c2eeef7362ce5be6e70d62e6bdf7ce. Review ACCEPT.

Six analytic tests on the shared `stage_mechanics` assembly: wet/dry depletion
limits with zero rates outside the burn; positive finite mass/inertias,
convex CG bounds, monotone mass over 201 points; parallel-axis theorem via an
independent about-the-nose route and roll inertia formula; inertia and mass
rates vs central finite differences; attitude invariance; motor outside the
carrier refused. Mutation (drop motor parallel-axis term, double roll rate)
fails two tests. Core 197 pass. No production/physics change; sealed binaries
and WASM unchanged.

Model idealization disclosed: dry body = uniform cylinder about the declared CG.
Measured mass/CG/inertia comparison (RMP09-C07) remains open and blocked on
team measurements.
