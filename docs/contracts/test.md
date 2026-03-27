---
id: contracts-test
title: Test
sidebar_label: Test
sidebar_position: 3
---

# Chainlink TON - Smart Contracts - Test

## Run the unit tests

```bash
# Enter the specific #contracts dev shell
nix develop .#contracts
pushd contracts

# (Optional) Compile the contracts first
yarn build
# If skipped, test will fall back to just-in-time compilation

# Run the Blueprint unit tests
yarn test
```
