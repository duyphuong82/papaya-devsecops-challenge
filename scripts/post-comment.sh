#!/usr/bin/env bash
# post-comment.sh REPO PR_NUMBER BODY_FILE MARKER_ID
set -euo pipefail
repo=$1; pr=$2; file=$3; marker="<!-- papaya-preview:$4 -->"
[[ $pr =~ ^[0-9]+$ ]] || { echo "PR number không hợp lệ" >&2; exit 2; }
[[ $4 =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "marker không hợp lệ" >&2; exit 2; }
body=$(printf '%s\n\n%s\n' "$marker" "$(head -c 60000 "$file")")
id=$(gh api --paginate "repos/$repo/issues/$pr/comments" --jq ".[] | select(.user.type==\"Bot\" and (.body|startswith(\"$marker\"))) | .id" | head -n1 || true)
if [[ -n $id ]]; then
  gh api -X PATCH "repos/$repo/issues/comments/$id" -f body="$body" >/dev/null && echo "updated comment $id"
else
  gh api -X POST "repos/$repo/issues/$pr/comments" -f body="$body" >/dev/null && echo "created comment"
fi
