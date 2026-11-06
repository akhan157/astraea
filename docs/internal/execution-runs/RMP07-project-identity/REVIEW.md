# RMP07b independent source review — ACCEPT after bare-import correction

Author/coordinator: installed OpenAI gpt-6.1-sol/high. Independent reviewer:
separate serial read-only Codex sessions using the same installed model/high.
No reviewer ran checks, modified files, opened restricted datasets or delegated.
This is independent authorship review, not different-model consensus.

Initial disposition: **REQUEST_CHANGES**. A selection-bearing bare vehicle could
enter the supported migration path, have its unknown `flightModel` metadata
stripped by vehicle normalization, and silently become implicit legacy. Initial
refusal tests covered versioned envelopes but not this valid import path.

Correction: the shared `validateVehicle` rejects any own `flightModel` key before
normalization. Selection is allowed only at a versioned project/archive root,
not on bare or nested vehicles. Ordinary no-selection bare documents remain
compatible. Added parser cases cover legacy/unsupported/null/empty declarations
on bare and nested vehicles; actual file/storage refusal tests cover bare and
versioned formats. The built synthetic browser journey now exercises both
unsupported imports and verifies unchanged retained project content.

Independent rereview disposition: **ACCEPT — no remaining material contract
defects found.** Version1/no-selection archives remain preserved; saved-input
restoration preserves selection state; exact invocation identity remains
separate. No core/default/candidate activation changes. Parent RMP07 partial.

Optional follow-up: a direct archive-vehicle selection regression (the common
validator already rejects it). Acceptance does not establish complete RMP07,
scientific/numerical qualification, native installed-platform acceptance or 1.0.

Local raw review files:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-project-identity/`:
- `independent-review.md`: SHA256 `66c04bd550019df46178cf387013561b04b62e6b4c2f4a9fe8d43c9ebfe3e5c0`.
- `independent-rereview.md`: SHA256 `9d3bff9bfc68903c0ac429b081fdc2d62a7a01171bdc4302b0d3cecf4171d98c`.
Prompts/transcripts remain local, not committed; this review summary is portable.
