#!/usr/bin/env bash
set -euo pipefail

POLL_INTERVAL=5   # seconds between successive polls
MAX_ATTEMPTS=120  # stop after ~10 minutes (adjust as needed)
fetch_latest() {
    gh run list \
    --repo "${TARGET_REPO}" \
    --workflow "${WORKFLOW}" \
    --branch "${TARGET_BRANCH}" \
    --status in_progress \
    --json databaseId \
    --limit 1 \
    --jq '.[0].databaseId'
}

gh workflow run "${WORKFLOW_FILE}" \
--repo "${TARGET_REPO}" \
--ref "${TARGET_BRANCH}" \
--field "ton_ref=${TON_REF}" \
--field "chainlink_version=${CHAINLINK_VERSION}" \
--field "contract_version=${CONTRACT_VERSION}" \
--field "custom_config=${CUSTOM_CONFIG}"

prev_id="$(fetch_latest)"   # initial snapshot (may be empty)
attempt=0

while (( attempt < MAX_ATTEMPTS )); do
    ((attempt++))
    sleep "$POLL_INTERVAL"

    cur_id="$(fetch_latest)"

    # If the id changed, we have a new run
    # Note: this simple logic assumes only one new run can appear during the polling period
    # so we don't actually know which ID is ours
    if [[ "$cur_id" != "$prev_id" ]]; then
    echo "New in‑progress run detected: databaseId=$cur_id"
    echo "Starting watch…"
    gh run watch --repo "$TARGET_REPO" "$cur_id"
    exit 0
    fi

    # Keep the last snapshot for the next iteration
    prev_id="$cur_id"
done

echo "Timeout reached – no new in‑progress run appeared."
exit 1