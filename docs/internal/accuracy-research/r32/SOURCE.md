# R32 digitisation record — copied provenance

These four files are unmodified copies of the R32 E-1b digitisation record on
`accuracy/integration` @ `04a6288` (implementation `a10a82d`), from
`docs/internal/accuracy-research/r32/`:

| File | Contents |
|---|---|
| `pre_registration.json` | frozen anchors, interpolation, joins, tail, source identity |
| `d4821-fig15b-readings.json` | per-pass 600/400-dpi pixel readings and conversions |
| `d4821-fig15b-calibration.json` | axis/scale calibration and pixel picks |
| `EVIDENCE.json` | evidence index, hashes and limits |

The source record has no CSV file: the per-pass digitisation is stored as the
two JSON files above. The records reference the original worktree and evidence
root paths; they are preserved verbatim as provenance, not rewritten for this
branch.

Source PDF: NASA TN D-4821, NTRS 19680027582, Fig. 15(b) beta = 0,
PDF p. 41 / printed p. 39, PDF SHA-256
`255b27ed88fc2f2d05e7233f4ca2f9faa41ff95b12325fa63d714d0af7059532`.

These files are not runtime inputs. The engine uses the anchors frozen in
`base_drag_amplitude_cylinder`; this directory exists so the cited provenance
path resolves on the app branch.
