#!/usr/bin/env bash
# apply-github-config.sh OWNER/REPO [--apply]   Mặc định chỉ in lệnh (dry-run). Cần gh đã đăng nhập bằng token có quyền admin repo.
set -euo pipefail
repo=${1:?OWNER/REPO}; mode=${2:-}
dir=$(cd "$(dirname "$0")" && pwd)
[[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "repo không hợp lệ" >&2; exit 2; }
run() { if [[ $mode == --apply ]]; then gh api "$@"; else echo "DRY-RUN gh api $*"; fi; }
for f in "$dir"/environments/prod-*.json "$dir"/environments/staging.json; do
  jq -e '[.reviewers[].id] | all(. != 0) and length > 0' "$f" >/dev/null || { echo "$f: còn reviewer placeholder (id 0) hoặc rỗng" >&2; exit 3; }
done
run -X PATCH "repos/$repo" --input "$dir/repo-security.json"
run -X PUT "repos/$repo/actions/permissions" --input "$dir/actions-permissions.json"
run -X PUT "repos/$repo/actions/permissions/selected-actions" --input "$dir/selected-actions.json"
run -X PUT "repos/$repo/actions/permissions/workflow" --input "$dir/workflow-permissions.json"
for e in dev staging prod-vn prod-th prod-hk; do
  run -X PUT "repos/$repo/environments/$e" --input "$dir/environments/$e.json"
  [[ $e == dev ]] || run -X POST "repos/$repo/environments/$e/deployment-branch-policies" --input "$dir/environments/branch-policy-main.json"
done
run -X POST "repos/$repo/rulesets" --input "$dir/ruleset-main.json"
