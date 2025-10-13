#!/usr/bin/env bash
set -euo pipefail

# Staging Test Runner
# Usage: ./run_test.sh [TON2EVM|EVM2TON]
# 
# Runs a single test direction (TON→EVM or EVM→TON)
#
# Environment variables (see env.example):
#   - TON_TESTNET_SELECTOR
#   - ETHEREUM_TESTNET_SEPOLIA_SELECTOR
#   - TON_TESTNET_ROUTER, TON_TESTNET_RECEIVER, TON_TESTNET_WALLET_KEY, TON_TESTNET_ENDPOINT
#   - ETHEREUM_TESTNET_SEPOLIA_ROUTER, ETHEREUM_TESTNET_SEPOLIA_RECEIVER
#   - ETHEREUM_TESTNET_SEPOLIA_WALLET_KEY, ETHEREUM_TESTNET_SEPOLIA_ENDPOINT
#   - MESSAGE (optional)

DIRECTION="${1:-TON2EVM}"

echo "========================================="
echo "CCIP Staging Test: ${DIRECTION}"
echo "========================================="
echo ""

# Validate required environment variables
required_vars=(
  "TON_TESTNET_SELECTOR"
  "ETHEREUM_TESTNET_SEPOLIA_SELECTOR"
  "TON_TESTNET_ROUTER"
  "TON_TESTNET_RECEIVER"
  "TON_TESTNET_WALLET_KEY"
  "TON_TESTNET_ENDPOINT"
  "ETHEREUM_TESTNET_SEPOLIA_ROUTER"
  "ETHEREUM_TESTNET_SEPOLIA_RECEIVER"
  "ETHEREUM_TESTNET_SEPOLIA_WALLET_KEY"
  "ETHEREUM_TESTNET_SEPOLIA_ENDPOINT"
)

missing_vars=()
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing_vars+=("$var")
  fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo "Error: Missing required environment variables:" >&2
  for var in "${missing_vars[@]}"; do
    echo "  - $var" >&2
  done
  echo "" >&2
  echo "Please set these variables or create a .env file (see env.example)" >&2
  exit 1
fi

# Display configuration
echo "Configuration:"
echo "  Direction:         ${DIRECTION}"
echo "  TON Selector:      ${TON_TESTNET_SELECTOR}"
echo "  Sepolia Selector:  ${ETHEREUM_TESTNET_SEPOLIA_SELECTOR}"
echo "  Message:           ${MESSAGE:-<default timestamp>}"
echo ""

# Run the appropriate test
case "$DIRECTION" in
  TON2EVM|ton2evm)
    echo "Running TON → EVM test..."
    go test -v -run Test_TON2EVM ./tests
    ;;
  EVM2TON|evm2ton)
    echo "Running EVM → TON test..."
    go test -v -run Test_EVM2TON ./tests
    ;;
  *)
    echo "Error: Invalid direction. Use TON2EVM or EVM2TON" >&2
    exit 1
    ;;
esac

exit_code=$?

if [[ $exit_code -eq 0 ]]; then
  echo ""
  echo "========================================="
  echo "✅ Test passed!"
  echo "========================================="
else
  echo ""
  echo "========================================="
  echo "❌ Test failed!"
  echo "========================================="
fi

exit $exit_code
