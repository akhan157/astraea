#!/bin/bash
# Fixed offline fixture runner; invoke with build or runtime.
set -euo pipefail
task_worktree=/workspace/astraea-worktrees/updater-verify-20261026
task_evidence=/workspace/astraea-plan/evidence/updater-verify-20261026
case "${1:-}" in
  build) task_command=(bash scripts/updater-fixture/build.sh) ;;
  runtime) task_command=(python3 scripts/updater-fixture/runtime.py) ;;
  *) echo 'usage: run-container.sh build|runtime' >&2; exit 2 ;;
esac
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock run --rm --pull=never \
  --network=none --cpuset-cpus=0 --cpus=1 --memory=4g --user "$(id -u):$(id -g)" \
  --mount type=bind,src=/workspace/.toolchains,dst=/workspace/.toolchains \
  --mount "type=bind,src=$task_worktree,dst=$task_worktree" \
  --mount type=bind,src=/workspace/astraea/node_modules,dst=/workspace/astraea/node_modules,readonly \
  --mount type=bind,src=/opt/codex/runtimes/codex-primary-runtime/dependencies/node,dst=/opt/node,readonly \
  --mount "type=bind,src=$task_evidence,dst=/evidence" \
  --mount type=bind,src=/etc/passwd,dst=/etc/passwd,readonly \
  --mount type=bind,src=/etc/group,dst=/etc/group,readonly \
  --workdir "$task_worktree" \
  sha256:9c6c230e1d815013fa34fcb6b9174d9a6f9e2a9ec68920b93f345e547c723174 \
  "${task_command[@]}"
