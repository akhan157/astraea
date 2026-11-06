# RMP12d — ensemble determinism on shipped WASM, RMP12-C05 PASS (current path)

Source 0263c20f6c1a131af050446caa29129e144b92ca (tests only), base 486683159e2fb35cfa8708a0d9beb4ecc6ae93af. Review ACCEPT.

New src/engine/ensembleDeterminism.test.ts on real astraea_engine.wasm bytes
(b32e7b7c…, not rebuilt): bit-identical landings (incl. signed zero) under four
partitions and on repeat; seed-sensitive; index-based (ensemble size does not
change run k); app ensemble host gives the same cloud with reversed chunk
completion (mutation-validated); cancellation before and after a recorded chunk
returns no cloud (mutation-validated). Plus cited TS-oracle, store and RMP15d
coverage for restart/new-identity cases.

Not a rerun of RMP12a/b/c, no numerical budget, no accuracy/statistical claim,
no cross-platform bit-identity claim. RMP12-C02 FAIL and others unchanged.
