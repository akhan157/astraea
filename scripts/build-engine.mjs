// Build the Rust engine (crates/astraea-engine) as WebAssembly and place it
// where the app imports it (src/engine/astraea_engine.wasm, generated, not
// committed). Requires the `wasm32-unknown-unknown` Rust target:
//   rustup target add wasm32-unknown-unknown
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(root, 'crates/astraea-engine/Cargo.toml');
execFileSync(
  'cargo',
  ['build', '--release', '--locked', '--target', 'wasm32-unknown-unknown', '--manifest-path', manifest],
  { stdio: 'inherit' },
);
// Ask Cargo for its actual output root: CARGO_TARGET_DIR and .cargo/config
// may override the crate-local target directory. Never copy a stale default build.
const metadata = JSON.parse(execFileSync(
  'cargo',
  ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', manifest],
  { encoding: 'utf8' },
));
if (typeof metadata.target_directory !== 'string') throw new Error('cargo metadata did not report a target directory');
const built = join(metadata.target_directory, 'wasm32-unknown-unknown/release/astraea_engine.wasm');
const dest = join(root, 'src/engine/astraea_engine.wasm');
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(built, dest);
console.log(`engine: ${dest}`);
