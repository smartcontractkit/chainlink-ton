#!/usr/bin/env bash
# get contract path from the first argument
REPO_ROOT=$(git rev-parse --show-toplevel)

CONTRACTS_DIR=$REPO_ROOT/contracts/contracts

RELATIVE_CONTRACT_PATH=$1
if [ -z "$RELATIVE_CONTRACT_PATH" ]; then
  echo "Usage: $0 <path_to_contract relative to $CONTRACTS_DIR>"
  exit 1
fi

CONTRACT_PATH=$CONTRACTS_DIR/$RELATIVE_CONTRACT_PATH
COMPILED_CONTRACT_PATH=$REPO_ROOT/contracts/wrappers/$RELATIVE_CONTRACT_PATH.compiled.json
BUILD_DIR=$(dirname "$COMPILED_CONTRACT_PATH")

# Check that the contract source file exists
if [ ! -f "$CONTRACT_PATH" ]; then
  echo "Error: Contract source file not found at $CONTRACT_PATH"
  exit 1
fi

# Compile the contract inside the contracts dir
# cd $CONTRACT_PATH
mkdir -p $BUILD_DIR
echo "Compiling contract..."
yarn tact $CONTRACT_PATH --output artifacts
#  --output $COMPILED_CONTRACT_PATH


# Verify the compiled file was created
if [ ! -f "$COMPILED_CONTRACT_PATH" ]; then
  echo "Error: Contract compilation failed. Compiled artifact not found at $COMPILED_CONTRACT_PATH"
  exit 1
fi

echo "Contract compiled successfully: $CONTRACT_PATH"

