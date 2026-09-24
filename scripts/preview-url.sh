#!/usr/bin/env bash
set -euo pipefail

repository="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
commit_sha="${1:-$(git rev-parse HEAD)}"
attempt=0
max_attempts=60

while (( attempt < max_attempts )); do
  deployment_id="$(
    gh api "repos/${repository}/deployments?sha=${commit_sha}&per_page=20" \
      --jq '[.[] | select(.environment | startswith("Preview"))][0].id // empty'
  )"

  if [[ -n "${deployment_id}" ]]; then
    preview_urls="$(
      gh api "repos/${repository}/deployments/${deployment_id}/statuses" \
        --jq '.[] | select(.state == "success") | .environment_url | select(length > 0)'
    )"
    while IFS= read -r preview_url; do
      [[ -z "${preview_url}" ]] && continue
      status_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${preview_url}")"
      if [[ "${status_code}" =~ ^2 ]]; then
        printf '%s\n' "${preview_url}"
        exit 0
      fi
    done <<< "${preview_urls}"
  fi

  attempt=$((attempt + 1))
  sleep 10
done

printf 'Preview was not ready after 10 minutes for commit %s.\n' "${commit_sha}" >&2
exit 1
