#!/usr/bin/env bash
# B1 P9 timing gate and one run. Logs every wait sample and the pre/post host state.
#
#   run-p9.sh <out-dir> [max-wait-seconds]
#
# Gates: 1-minute load average < 6 AND no other vitest/playwright/bun-test/npm-test
# process. A headless browser is logged but not gated: a user preview is not a test job.
# Exits 3 if the host never goes quiet within the wait budget; P9 is then NOT run.
set -u
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
OUT="${1:-}"
MAX_WAIT_S="${2:-3600}"
if [ -z "$OUT" ]; then echo "usage: run-p9.sh <out-dir> [max-wait-seconds]" >&2; exit 2; fi
mkdir -p "$OUT"
LOG="$OUT/p9-run.log"
: > "$LOG"

BASE=/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm
CAND=/home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/candidate-4c1ec4ed.wasm
BASE_SHA=bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff
CAND_SHA=4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535
TMP="${B1_TMPDIR:-/home/ak/b1-final/tmp}"
mkdir -p "$TMP"
export TMPDIR="$TMP" B1_ROUNDS="${B1_ROUNDS:-12}"

check_hash() {
  actual=$(sha256sum "$1" | cut -d' ' -f1)
  if [ "$actual" != "$2" ]; then
    echo "HASH MISMATCH $1: $actual != $2" | tee -a "$LOG" >&2
    exit 4
  fi
  echo "hash ok $1 $actual" >> "$LOG"
}
check_hash "$BASE" "$BASE_SHA"
check_hash "$CAND" "$CAND_SHA"

start=$(date +%s)
while :; do
  l1=$(cut -d' ' -f1 /proc/loadavg)
  busy=$(ps -eo args= | grep -E '[v]itest|[p]laywright test|[b]un test|[n]pm (run )?test|[p]pnpm (run )?test' | grep -v 'grep -E' | head -3 | tr '\n' '|')
  browsers=$(pgrep -c chrome-headless-shell 2>/dev/null || true)
  echo "$(date +%T) wait-sample load1=$l1 busy=${busy:-none} headless_chrome=${browsers:-0}" >> "$LOG"
  if awk -v l="$l1" 'BEGIN{exit !(l<6)}' && [ -z "$busy" ]; then break; fi
  if [ $(( $(date +%s) - start )) -ge "$MAX_WAIT_S" ]; then
    echo "GAVE UP: host not quiet within ${MAX_WAIT_S}s; P9 not run" >> "$LOG"
    exit 3
  fi
  sleep 20
done

{
  echo "== pre-run $(date -Is)"
  echo "cwd=$REPO"
  free -h
  uptime
  echo "loadavg=$(cat /proc/loadavg)"
  ps -eo pid,etime,args= | grep -E '[v]itest|[p]laywright test' || true
  echo "base=$BASE"
  echo "cand=$CAND"
  echo "rounds=$B1_ROUNDS tmp=$TMPDIR"
} >> "$LOG" 2>&1

cd "$REPO" || exit 5
B1_OUT="$OUT" B1_BASE_WASM="$BASE" B1_CAND_WASM="$CAND" \
  ./node_modules/.bin/vitest run --maxWorkers=2 \
  --config docs/internal/execution-runs/B1-step3-benchmark/vitest.config.ts p9 >> "$LOG" 2>&1
rc=$?

{
  echo "== vitest exit=$rc $(date -Is)"
  free -h
  uptime
  echo "loadavg=$(cat /proc/loadavg)"
} >> "$LOG" 2>&1

if [ -f "$OUT/p9-summary.json" ] && [ -f "$OUT/p9-raw-ms.json" ]; then
  sha256sum "$OUT/p9-summary.json" "$OUT/p9-raw-ms.json" | tee "$OUT/SHA256SUMS" >> "$LOG"
fi
exit $rc
