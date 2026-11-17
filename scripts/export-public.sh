#!/usr/bin/env bash
# Export astraea-dev main to the public repo akhan157/astraea as ONE commit:
# the dev tree minus the private session-handoff notes, authored by the
# no-reply identity, on top of public main. Dry run by default: it prints the
# file changes and the commit message; pass --push to publish.
#
#   scripts/export-public.sh "Subject line" [--push] [--ref origin/main]
#
# Run from a clone of astraea-dev. It never touches your working tree or index.
set -euo pipefail

subject=${1:?usage: export-public.sh "Subject line" [--push] [--ref <dev ref>]}
shift
push=false
ref=origin/main
while [ $# -gt 0 ]; do
  case "$1" in
    --push) push=true ;;
    --ref) ref=$2; shift ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

PUBLIC_URL=https://github.com/akhan157/astraea.git
EXCLUDE=(docs/internal/session-handoff docs/internal/SESSION-HANDOFF.md)
NAME='Adnan Khan'
EMAIL='72093369+akhan157@users.noreply.github.com'

git fetch -q origin
git fetch -q "$PUBLIC_URL" main
public=$(git rev-parse FETCH_HEAD)
dev=$(git rev-parse --verify "$ref^{commit}")

index=$(mktemp)
trap 'rm -f "$index"' EXIT
GIT_INDEX_FILE=$index git read-tree "$dev"
GIT_INDEX_FILE=$index git rm -q -r --cached --ignore-unmatch "${EXCLUDE[@]}"
tree=$(GIT_INDEX_FILE=$index git write-tree)

for path in "${EXCLUDE[@]}"; do
  if git ls-tree -r --name-only "$tree" -- "$path" | grep -q .; then
    echo "refusing: $path is still in the export tree" >&2; exit 1
  fi
done

if [ "$tree" = "$(git rev-parse "$public^{tree}")" ]; then
  echo "public main already matches dev $(git rev-parse --short "$dev"); nothing to export"; exit 0
fi

echo "== changes public main $(git rev-parse --short "$public") -> dev $(git rev-parse --short "$dev")"
git diff --stat "$public" "$tree" | tail -20

message="$subject

Exported from astraea-dev main@$(git rev-parse --short=7 "$dev") (session-handoff notes excluded).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

commit=$(GIT_AUTHOR_NAME=$NAME GIT_AUTHOR_EMAIL=$EMAIL GIT_COMMITTER_NAME=$NAME GIT_COMMITTER_EMAIL=$EMAIL \
  git commit-tree "$tree" -p "$public" -m "$message")
echo "== export commit $commit"
git log -1 --format='%an <%ae>%n%n%B' "$commit"

if $push; then
  git push "$PUBLIC_URL" "${commit}:refs/heads/main"
  echo "pushed: public main is now $(git rev-parse --short "$commit"); public CI runs on it"
else
  echo "dry run; re-run with --push to publish"
fi
