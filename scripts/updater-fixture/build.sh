#!/bin/bash
set -euo pipefail
export CARGO_BUILD_JOBS=1 CARGO_NET_OFFLINE=true
export CARGO_TARGET_DIR=/workspace/.toolchains/desktop-target
export XDG_CACHE_HOME=/evidence/xdg/cache XDG_CONFIG_HOME=/evidence/xdg/config XDG_DATA_HOME=/evidence/xdg/data
cp --reflink=never "$CARGO_TARGET_DIR/debug/astraea-workstation" /evidence/prebuild-debug
trap 'cp --reflink=never /evidence/prebuild-debug "$CARGO_TARGET_DIR/debug/astraea-workstation"' EXIT
cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --locked --offline -j 1
cargo test --manifest-path src-tauri/Cargo.toml --lib --features updater-fixture --locked --offline -j 1 fixture_guard_refuses_missing_or_nonfixture_configuration
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --features updater-fixture --config /evidence/fixture-config.json -- --locked --offline -j 1
cp --reflink=never "$CARGO_TARGET_DIR/debug/astraea-workstation" /evidence/fixture-debug
