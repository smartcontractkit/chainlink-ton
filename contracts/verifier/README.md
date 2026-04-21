# Temporary Contract Verifier Utility

This script provides a temporary contract verification workflow on top of `blueprint`.
**Note:** This is a stopgap solution and should be replaced with proper CI-based verification during contract deployment.

## Overview

- Automates contract verification using the `blueprint` CLI.
- Designed for manual or temporary use.
- Handles all contracts that have been deployed in the testnet environment.

## Prerequisites

- `jq` installed for JSON parsing.
- The `blueprint` CLI available and configured.
- An `address_ref.json` file in this directory (data store with contract addresses).
- **WALLET_MNEMONIC** and **WALLET_VERSION** environment variables must be exported and configured with a wallet that has enough balance to run the verification process.
- Ensure the wallet has been initialized for the corresponding network. **Do not use a mainnet (-239) address on testnet (-3)**, otherwise `blueprint` will derive the address incorrectly and the wallet may not be properly initialized.

## Usage

From the `contracts/verifier` directory, run:

```bash
./verifier.sh
```

The script will:

1. Parse `address_ref.json` for contracts matching the TON chain selectors.
2. Map contract types as follows:
   - Any type containing `ManyChainMultiSig` → `mcms.MCMS`
   - Any type containing `timelock` (case-insensitive) → `mcms.RBACTimelock`
   - All others remain unchanged
3. For each contract, run `blueprint verify` piping required input.

## Notes

- This script is intended for manual or temporary use only.
- For production deployments, integrate contract verification into your CI/CD pipeline.
- Review and update the script as needed for your specific contract types and verification requirements.
- **The process is quite inefficient given that it runs verifications many times when not needed, for example, if the contract has already been verified.**
