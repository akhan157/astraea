#!/bin/bash
set -euo pipefail
export CARGO_BUILD_JOBS=1
export CARGO_TARGET_DIR=/workspace/.toolchains/desktop-target
export CARGO_NET_OFFLINE=true
export XDG_CACHE_HOME=/evidence/xdg/cache
export XDG_CONFIG_HOME=/evidence/xdg/config
export XDG_DATA_HOME=/evidence/xdg/data
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --config /evidence/bridge-config.json -- --locked --offline -j 1
cp "$CARGO_TARGET_DIR/debug/astraea-workstation" /evidence/bridge204-debug
