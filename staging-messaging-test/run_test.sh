#!/usr/bin/env bash
set -euo pipefail

# Usage: ./run_staging_test_cli.sh ROUTER SELECTOR RECEIVER SEED_PHRASE [MESSAGE] [SEPOLIA_RPC_URL]
# Example:
# ./run_staging_test_cli.sh \
#   -1:abcdef0123... 1399300952838017768 0xB6eE265Bb956277C9527707E2c8f54Fac2B80220 \
#   "word1 word2 ... word24" "hello-ton->evm" https://sepolia.infura.io/v3/KEY

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 ROUTER SELECTOR RECEIVER SEED_PHRASE [MESSAGE] [SEPOLIA_RPC_URL]" >&2
  exit 1
fi

ROUTER="$1"
SELECTOR="$2"
RECEIVER="$3"
SEED="$4"
MESSAGE="${5:-hello-ton->evm}"
RPC="${6:-}"

export TON_ROUTER_ADDRESS="$ROUTER"
export EVM_DEST_CHAIN_SELECTOR="$SELECTOR"
export EVM_RECEIVER_ADDRESS="$RECEIVER"
export TON_SENDER_WALLET_SEED_PHRASE="$SEED"
export CCIP_MESSAGE="$MESSAGE"

if [[ -n "$RPC" ]]; then
  export SEPOLIA_RPC_URL="$RPC"
fi

echo "Running test..."
echo "  Router: $TON_ROUTER_ADDRESS"
echo "  Selector: $EVM_DEST_CHAIN_SELECTOR"
echo "  Receiver: $EVM_RECEIVER_ADDRESS"
echo "  Message: $CCIP_MESSAGE"
[[ -n "${SEPOLIA_RPC_URL:-}" ]] && echo "  RPC: (custom)" || echo "  RPC: (default in code)"

go test -v -run Test_StagingMessagingTest
