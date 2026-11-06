# RMP12 runtime artifacts — controlled experiment result

Author: direct OMP DeepSeek V4.1 Flash 1017, `deepseek/deepseek-flash`, max,
prior author session `bb4735ed-ea47-4041-a188-e79100812511`.
Activation/source pin: `9443d91b600f0762de6e166b97c54491f2f3dc62`.
Author finished at the experiment gate; acceptance is coordinator-owned.

The full author result and exact commands are retained outside Git in
`../evidence-rmp12-runtime-artifacts/{EXPERIMENT-RESULT.md,commands.txt,INDEX.sha256}`.
No production edits, Stage-2 experiment or runtime/browser run occurred.

| Experiment | Outcome |
| --- | --- |
| Same root, independent clean targets | Equal: `d76ec54469a50d893f347f8c08ccb524cb882c9718095d8a19c0202d8b4f21e0`, 1826809 bytes |
| Second root without remap | Different: `1a3ed9aa1f0b8eab85064df7b3a0f5a53cce31f84c87c8ed34ac28bc52fef897`, 1826936 bytes |
| Root A with remap | `93aa3c07bafc0b94a78c5e1ad7f01353ffe7ebd4668ffaedb2f2a32406ea482f`, 1826681 bytes |
| Root B with remap | `6cf7fe0bcef70fa4e960090899d596448a4f5691cffab64b1fdeef0917b5a083`, 1826680 bytes |

Remap removes the eleven absolute source-root strings. Data sections become
byte-identical; code and element sections remain different. Cargo crate metadata
is root-specific. Its causal connection to residual ordering is an inference,
not semantic equivalence proof. Same-root repeat establishes bounded stability,
not cross-machine/toolchain reproducibility. Historical knot coordinator bytes
are absent; no reconstruction is required or substituted for original evidence.

No scientific qualification, acceptance-register promotion or product change is
claimed by the author result. See REVIEW.md for independent disposition.
