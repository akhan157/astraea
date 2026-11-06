# RMP12 runtime artifacts — read-only diagnosis and proposed fix/test contract

Status: **gate-1 proposal. No builds, tests, production edits, commits or records
touched.** Author route confirmed from this session's own transcript metadata:
`deepseek/deepseek-flash` (provider `deepseek`, catalog name **DeepSeek V4.1
Flash 1017**), thinking `max`; catalog re-read with `omp models deepseek --json`
and reports `thinking: ["low","high","max"]`. No fallback observed.

Environment: cwd `/home/ak/.paseo/worktrees/3s8t98rp/rmp12-runtime-artifacts`,
branch `rmp12-runtime-artifacts`, HEAD `9443d91b600f0762de6e166b97c54491f2f3dc62`
(clean; only this packet directory is untracked). Base `8bd27a6` differs by
coordination docs only, so the activation pin is unchanged.

Records read: this ASSIGNMENT, `RMP12-knot-split/{REVIEW,COORDINATOR-EVIDENCE,
EVIDENCE,RESULT}.md/json`, `RMP07-candidate-runtime/{REVIEW,COORDINATOR-EVIDENCE,
EVIDENCE,RESULT}`, global `AGENTS.md`, `execution-package/{CONTROL-LOOP,
DECISIONS,ARTIFACTS,packets/RMP12}.md`, `coordination/TASKS.md`.

## 1. Retained artifacts and embedded build roots

Every retained engine WASM embeds the **absolute worktree path it was built in**
in its read-only data (panic-location strings). Mapping (SHA-256 prefix / bytes /
embedded root):

| Artifact | Bytes | Embedded root |
| --- | --- | --- |
| `68804608…` author knot-split (retained, author lane + `target-knot-split`) | 1,576,975 | `…/rmp12-knot-split` ×10 |
| `cf57158b…` coordinator knot-split (merged tree) | 1,576,911 | **bytes not retained**; only browser-recorded size/hash |
| `307f585c…` author candidate-runtime (retained, evidence target dir) | 1,827,256 | `…/rmp07-candidate-runtime` ×11 |
| `13da44d5…` coordinator candidate-runtime (retained, `loud-swan`) | 1,827,128 | `…/loud-swan` ×11 |
| `08394e52…` ensemble author | 1,570,210 | `…/rmp13-ensemble-outcome-ledger` |
| `b32e7b7c…` / `b971b222…` older copies | — | `…/furry-fish` |

Consequences:
- Identical hashes appear only where the same build was copied (e.g.
  `b32e7b7c` in four `target-rmp*` dirs all embed the furry-fish root).
- The four `target-rmp01/08/09/10` fingerprint dirs therefore do **not** show
  root independence; they are copies/one-root builds.
- `cf57158b` bytes are gone; only its hash and length survive. Historical bytes
  must never be regenerated as if original; a hash-matching reconstruction is
  evidence, not a replacement.

## 2. Controlled same-source pair, byte-level result

Best-controlled pair: candidate runtime `066960f…` source, coordinator merge
`61367757…`. `git diff --stat 066960f 61367757 -- crates/astraea-core
crates/astraea-engine` is **empty**; `crates/astraea-engine/Cargo.lock` diff is
empty; author lane clean at its records HEAD. Dep-info build file sets from both
target dirs are the committed non-test file set (21 files; the three `*_tests.rs`
files are correctly absent from the cdylib unit).

Sections (author → coordinator):

| Section | Bytes | Result |
| --- | --- | --- |
| type (1) | 683 | identical |
| function (3) | 1,114 | **9 bytes differ**; type indices of functions 749–757 |
| table/memory/global | 7/3/9/96 | identical |
| export (7) | 96 | identical |
| element (9) | 406 | differs (function-index renumbering) |
| code (10) | 1,130,149 | same size, bytes differ |
| data (11) | 694,756 → 694,628 | differs |

No custom sections exist in either artifact (release profile `strip = true`), so
custom-section/producer metadata is not the difference.

Data section: after masking the 898 four-byte data-address words in each blob,
the **only remaining string-literal differences are the 11 absolute
`astraea-core/src/…` path strings**. `i64/i32.load/store` offsets differ mostly
by −152 / −128; one second-segment address word differs by −128; the 26-byte
length residual is consistent with alignment/layout, not extra content
([INFERENCE], but all long string runs are identical after masking).

Code section: 483,204 disassembly lines each; 14,848 differing lines —
5,543 `i32.const`, 2,396 load/store offsets, 188 `call` target indices, 311
non-instruction/header lines, remainder local encoding shifts. Normalizing
functions to instruction shapes: **the multiset of 1,112 function shapes is
identical**; 1,058 keep their index; 54 are permuted. Pre-link rlib objects
confirm this is codegen-level: engine object has 2,198 defined symbols (672
function symbols); after canonicalising v0 crate ids the symbol set is
effectively identical (3 names each side differ only because identical-code
merge kept a different representative), 561 stay at the same position, 108 move
(mostly +1 shifts and small block moves).

So: **no semantic source change is visible** — same literal content, same
instruction-shape set — but ordering and address constants differ.

## 3. Actual build inputs that differ

- **Absolute source root**: proven by embedded path strings, and by Cargo's
  path-derived unit metadata. The exact-build rlib object names carry different
  crate disambiguators:
  - engine: `sfmntZMophHp` (`…/evidence-rmp07-candidate-runtime/…`,
    crate id in `astraea_engine.astraea_engine.b2eb2047a9f4d741-cgu.0.rcgu.o`)
    vs `s94s8Gk08JYo` (`…/loud-swan`, `…69aa50992b2f3616…`);
  - core rlib metadata suffix: `7e21964dee4dd558` vs `ec4b879d5f0c4269`
    (`rmp12-knot-split` build: `803b56f47e9141b3`; furry-fish builds:
    `d5f4a564313843d0`).
  Cargo fingerprint `path` values likewise differ per root (`8032633974255399886`,
  `17577755599807140451`, `7697280682882626052`, `607864645327102628`), while the
  engine fingerprint `path` hash is constant across roots
  (`10763286916239946207`) — the exact internal hashed string is not exposed by
  Cargo's retained JSON, so the only proven statement is that path-derived unit
  metadata differs, not which spelling of the path Cargo hashed.
- **Function ordering/identical-code merging** differs. [INFERENCE] This is the
  consequence of the crate-id change (symbol names carry the disambiguator);
  `--remap-path-prefix` does not change crate ids, so remap alone is **not
  demonstrated sufficient**. Compiler nondeterminism independent of inputs is
  not excluded by retained evidence.
- **Not different**: rustc/LLVM (`rustc 1.99.1 (58cf8f9c3 2026-10-13)`,
  LLVM 23.1.1, same Cargo `rustc_fingerprint` 2230359520671101499 in all three
  target dirs), target (`wasm32-unknown-unknown`), profile fingerprint
  (6039858914441145332 = opt-level 3 / lto / codegen-units 1 / strip), target
  fingerprint, feature set (`[]`), effective `rustflags` (`[]` in every compared
  fingerprint). No `~/.cargo/config.toml`, no repo `.cargo/config.toml`, no
  `rust-toolchain.toml`; rustup default stable; current env has
  `CARGO_BUILD_JOBS=2` and no `RUSTFLAGS`/`CARGO_ENCODED_RUSTFLAGS`.
- **Invocation differences** (author raw cargo with relative `--manifest-path`,
  `--offline --locked -j 2`, external `CARGO_TARGET_DIR`; coordinator
  `scripts/build-engine.mjs`, absolute manifest, default target dir) did not
  change the toolchain/profile/feature fingerprint fields. Their byte effect is
  exactly what the controlled tests will separate; no target-dir/`OUT_DIR`
  string is embedded in either artifact.

## 4. Knot-split pair (the disputed recorded hashes)

- Author `68804608…`: retained, 1,576,975 bytes, sections: code 896,883
  (`af34767a178e…`), data 677,980 (`0b8ff1cbfc88…`), segments
  `(1048576,677480)+(1726056,480)`, no custom sections; embeds the author root
  10× plus 5 registry paths.
- Coordinator `cf57158b…`: **file not retained**; browser evidence records
  `bytes: 1576911`, hash `cf57158b…`. It is 64 bytes smaller. With the author
  root lane name length 16 vs `loud-swan` 9, ten path occurrences predict a
  70-byte shrink; 64 observed means 6 bytes of alignment/layout adjustment
  ([INFERENCE]). This is consistent with, but does not prove, a loud-swan build.
- A byte-level section diff of this pair is impossible without the file. The
  prior remap probe is **not usable evidence**: its commands and both artifacts
  (`2fcfa2a6…`, `2025cdb4…`) are not retained anywhere searched (docs, packet,
  external evidence, target dirs). Its failure therefore neither proves nor
  disproves path dependence; this proposal does not rely on it.

## 5. Fix decision the evidence supports

Two mechanisms are proven present: absolute path strings (fixable by remap) and
path-derived crate ids/ordering (not fixable by remap). Therefore:

**Stage 1 — necessary and low risk (recommended now).** In
`scripts/build-engine.mjs`:
- canonicalise the repo root (`realpathSync`);
- compose `CARGO_ENCODED_RUSTFLAGS` from inherited env (encoded wins, else
  whitespace-split `RUSTFLAGS`) and append
  `--remap-path-prefix=<root>=<token>`; delete `RUSTFLAGS` for the child;
- token constant `astraea` (coordinator may choose; token is part of future
  identity);
- after copying, fail if the built bytes still contain `<root>` (the guard would
  have caught this defect); print SHA-256/size for audit.
This removes worktree paths from data and makes the data section
path-independent. It cannot fix crate ids.

**Stage 2 — only if Stage 1 measurement proves byte inequality remains
(coordinator decision).** Build from a canonical root so Cargo derives one
crate id:
- preferred cheap test first: build through a fixed symlink path and check
  whether Cargo honours it (crate id equal across two worktrees) — no copy, but
  symlink/Windows behaviour must be verified;
- otherwise stage `crates/` (4.6 MB source, no `target/`) into a fixed
  worktree-independent cache path (e.g. `$XDG_CACHE_HOME/astraea/engine-build`),
  build there with the same lock/offline flags, remap that staged root to the
  token, copy back; single-writer lock; record staged-input hash.
No post-build byte patching, extra stripping, `-C metadata` override via
unsupported flags, historical-hash rewrite, or cross-machine claim. If neither
stage yields equality under identical source/lock/toolchain, the honest outcome
is "not byte-reproducible across build roots"; report, do not cosmetically
equalise.

Identity consequence: Stage 1 changes future WASM bytes and therefore the
recorded engine SHA of any later build. Old artifacts/hashes/fits stay
historical; the existing engine-SHA mismatch refusal keeps old calibration fits
inactive. No schema/output semantics change. This is the coordinator decision
gate.

## 6. Exact test contract (after approval only)

Resources: `free -h` ≥ 2 GiB before each step; `CARGO_BUILD_JOBS=2`, `-j 2`,
`CARGO_NET_OFFLINE=true`; sequential builds; per-build target dirs under
`/tmp`; stop and delete every temporary runtime/tree after evidence capture;
no servers; `/tmp` trees are not evidence.

Controls, using `git archive <sha> | tar -x -C <root>` for byte-identical
source copies:
- **T0 stability**: same root, two target dirs → expect identical SHA.
- **T1 red**: source `4907071` extracted to `/tmp/r12/a` and
  `/tmp/r12/build-root-b-longer`, unmodified script, no remap → expect
  **different** SHA; record sections, embedded roots, sizes (this reproduces the
  defect).
- **T2 remap sufficiency**: T1 with Stage 1 → **if SHA equal, Stage 1 is the
  fix**; record new token SHA; stop. If unequal, record the residual
  section/function-order diff and go to T3; this is the pre-registered
  falsifier of "remap is sufficient".
- **T3 canonical root**: Stage 2 candidate (symlink first, else staging) from
  the same two extracted roots, with remap → expect SHA equal; record crate ids
  of both staged builds (rlib object names) to show metadata equalised.
- **T4 discrimination (only if T3 fails)**: same root script vs relative raw
  invocation, same root two target dirs, two roots same form — determine
  whether the crate id depends on root, invocation form or neither; record
  `-C metadata`/crate ids. Do not change production code in this step.
- **T5 historical reconstruction** (source copies, token patched in the
  throwaway copy to the historical root; from = new temp root):
  - `4907071` → token `…/rmp12-knot-split` ⇒ expect `68804608…`, 1,576,975,
    code `af34767a…`, data `0b8ff1cb…`;
  - `4907071` → token `…/loud-swan` ⇒ expect `cf57158b…`, 1,576,911
    (validates the inferred coordinator root);
  - `066960f` → token `…/rmp07-candidate-runtime` ⇒ expect `307f585c…`,
    1,827,256;
  - `066960f` → token `…/loud-swan` ⇒ expect `13da44d5…`, 1,827,128.
  Any mismatch stops the fix claim: mechanism incomplete; do not adjust records
  or historical bytes.
- **T6 runtime/semantic proof**: for the new token artifact run the existing
  Node WASM worker smoke (success + 8 refusals) and compare replies/digests
  byte-for-byte with the retained historical replies; verify instruction-shape
  multiset and long-string content against the historical artifact; native
  legacy stdout hash unchanged. If T5 matches, historical runtime evidence also
  transfers by byte identity.
- **T7 negative/guard**: run with `CARGO_ENCODED_RUSTFLAGS=""` (encoded
  precedence suppresses remap): expect the new guard to fail and T1's hash
  differences to reproduce. Proves the fix is effective, not cosmetic.
- **T8 identity disclosure**: record new SHA/bytes, token, rustc/crate ids,
  exact commands; leave old records untouched; report remaining limits
  (toolchain unpinned, registry/home paths host-dependent, no cross-machine
  claim, `cf57158b` bytes unrecoverable).

## 7. Remaining limits and open questions

- `cf57158b` bytes are not recoverable; only hash-matching reconstruction can
  explain them.
- Cargo's internal hashed path input is not exposed; the crate-id difference is
  proven, its exact spelling is not.
- Compiler nondeterminism independent of inputs is not excluded until T2/T3.
- Toolchain is not pinned in-repo (`rust-toolchain.toml` absent); future rustc
  changes alter bytes. Pinning is out of scope and may need external toolchain
  availability.
- Registry paths (`/home/ak/.cargo/registry/src/index.crates.io-…`) remain
  embedded; no cross-machine reproducibility is claimed.
- Stage 2 staging adds a copy/lock and a second build path; if the coordinator
  prefers, release builds may instead be required to run from one canonical
  checkout (process rule) with no code change.

## 8. Decisions requested

1. Approve this gate-1 diagnosis/scope, and the file lease for
   `scripts/build-engine.mjs` (+ evidence scripts outside the repo).
2. Approve Stage 1 (remap + guard) for implementation and the T0–T2/T5–T7 test
   contract; confirm the token `astraea` or choose another.
3. If T2 fails: approve or reject Stage 2 (symlink test first, then canonical
   staging) before it is implemented; do not let the lane pick silently.
4. Acknowledge that Stage 1 changes future engine SHA identity while historical
   artifacts/hashes/fits stay untouched (existing mismatch refusal remains).
5. Confirm whether the artifact guard (fail when the built WASM embeds the
   absolute source root) is wanted; recommended yes.

No acceptance register, manifest, TASKS, handoff, physics, schema, numerical
policy, support, budget or historical evidence was modified. Author cannot
self-accept. Waiting at the gate before any build or production edit.
