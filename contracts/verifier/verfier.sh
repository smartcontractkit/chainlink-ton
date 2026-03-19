#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

map_contract_type() {
  local type="$1"
  if [[ "$type" == *ManyChainMultiSig* ]]; then
    printf '%s\n' "mcms.MCMS"
  elif [[ "$type" == *RBACTimelock* ]]; then
    printf '%s\n' "mcms.RBACTimelock"
  elif [[ "$type" == *Receiver* ]]; then
      printf '%s\n' "ccip.test.receiver"
  else
    printf '%s\n' "$type"
  fi
}

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

JSON_FILE="./address_ref.json"
TESTNET_CHAIN_SELECTOR="1399300952838017768"
MAINNET_CHAIN_SELECTOR="16448340667252469081"
COMPILER_VERSION="1.2.0"

command -v jq >/dev/null || die "jq not found"
command -v blueprint >/dev/null || die "blueprint not found"
command -v expect >/dev/null || die "expect not found"
[[ -f "$JSON_FILE" ]] || die "JSON file not found: $JSON_FILE"

# Get verifiers (testnet section as before, but we will use same list for both unless you split later)
mapfile -t VERIFIERS < <(
  blueprint verify --list-verifiers \
    | awk '/Testnet:/,0' \
    | grep -Eo '\- [^ ]+' \
    | sed 's/- //'
)

((${#VERIFIERS[@]})) || die "No verifiers found"

mapfile -t ENTRIES < <(
  jq -c \
    --argjson testnet "$TESTNET_CHAIN_SELECTOR" \
    --argjson mainnet "$MAINNET_CHAIN_SELECTOR" '
    .[]
    | select(
        (.chainSelector == $testnet or .chainSelector == $mainnet)
        and
        (.type | contains("LinkToken") | not)
      )
    | {chainSelector, type, qualifier, address}
  ' "$JSON_FILE"
)

TOTAL_CONTRACTS="${#ENTRIES[@]}"
TOTAL_VERIFICATIONS=$(( TOTAL_CONTRACTS * ${#VERIFIERS[@]} ))
CURRENT=0

printf 'Total contracts to verify: %s\n' "$TOTAL_CONTRACTS"
printf 'Total verification runs:   %s (contracts x verifiers)\n\n' "$TOTAL_VERIFICATIONS"

# Blueprint CLI needs root of contracts repo
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pushd "$SCRIPT_DIR/.." >/dev/null

for entry in "${ENTRIES[@]}"; do
  RAW_TYPE="$(jq -r '.type' <<<"$entry")"
  [[ "$RAW_TYPE" == *LinkToken* ]] && continue

  CHAIN_SELECTOR="$(jq -r '.chainSelector' <<<"$entry")"
  QUALIFIER="$(jq -r '.qualifier' <<<"$entry")"
  ADDRESS="$(jq -r '.address' <<<"$entry")"
  CONTRACT="$(map_contract_type "$RAW_TYPE")"

  # Decide network-specific flags + links
  BLUEPRINT_NET_FLAGS=()
  VERIFIER_QUERY=""
  TONVIEWER_HOST=""

  if [[ "$CHAIN_SELECTOR" == "$TESTNET_CHAIN_SELECTOR" ]]; then
    BLUEPRINT_NET_FLAGS=(--testnet)
    VERIFIER_QUERY="?testnet=true"
    TONVIEWER_HOST="https://testnet.tonviewer.com"
  elif [[ "$CHAIN_SELECTOR" == "$MAINNET_CHAIN_SELECTOR" ]]; then
    BLUEPRINT_NET_FLAGS=()
    VERIFIER_QUERY=""
    TONVIEWER_HOST="https://tonviewer.com"
  else
    continue
  fi

  for verifier in "${VERIFIERS[@]}"; do
    CURRENT=$((CURRENT + 1))

    printf '[%d/%d] Verifying %s (%s) at %s with verifier %s\n' \
      "$CURRENT" "$TOTAL_VERIFICATIONS" "$CONTRACT" "$QUALIFIER" "$ADDRESS" "$verifier"

    expect <<EOF
set timeout -1

spawn blueprint verify "$CONTRACT" \
  --verifier "$verifier" \
  ${BLUEPRINT_NET_FLAGS[*]} \
  --mnemonic \
  --compiler-version "$COMPILER_VERSION"

expect -re {(?i)\(y/n\)|Do you want to specify the address manually}
send -- "Y\r"

expect -re {(?i)Deployed contract address}
send -- "$ADDRESS\r"

expect eof
set wait_status [wait]
set exit_code [lindex \$wait_status 3]
exit \$exit_code
EOF

    echo "Finish: $CONTRACT ($QUALIFIER) with $verifier double-check:"
    echo "https://verifier.ton.org/${ADDRESS}${VERIFIER_QUERY}"
    echo "${TONVIEWER_HOST}/${ADDRESS}"
    echo ""
  done
done

popd >/dev/null