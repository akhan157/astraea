# RMP07g — exact built runtime receipt (RMP07-C08)

Base/source e7e3bf67880b225ceedf2a23d4c0d3645336df4d (no source change). Author omp (anthropic/claude-opus-5-5);
serial MiMo no-tools review. Goal increment 5. Records only.

Contract already implemented and unit-tested (src/engine/identity.ts
loadEngineModule: one fetch; the same ArrayBuffer is hashed and compiled; the
compiled Module is shared with every worker; failures give no identity).
Missing for C08: a receipt on the newly offered build that the dist asset hash,
the bytes actually served to the running app, and the identity the app records
on results all agree, and a process rule that old evidence is not claimed
against a changed asset.

Earlier note: RMP09-C04 (recovery sequence) investigated and NOT attempted — the
legacy engine has no trigger-delay/failed-trigger/independent-section
configuration, so a pass would claim unsupported capability.
