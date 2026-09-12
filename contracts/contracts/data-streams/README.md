# Chainlink Data Streams — TON Contracts

Smart contracts for verifying [Chainlink Data Streams](https://docs.chain.link/data-streams) reports on the TON blockchain.

## Overview

The Verifier contract accepts signed Data Streams reports produced by the Chainlink Decentralized Oracle Network (DON) 
and verifies that enough authorized oracles signed them. Because the DON uses the same secp256k1 signatures and EVM ABI 
encoding it uses for EVM chains, no changes are required on the DON side — the same reports are valid on TON.

**What it does:**
1. Parses an EVM ABI-encoded report payload submitted by any caller
2. Checks the config digest is registered and active
3. Computes the signing hash: `keccak256(keccak256(reportData) || reportContext)`
4. Recovers the signer Ethereum address from each ECDSA signature via `ecrecover`
5. Verifies each signer is in the registered oracle set and that exactly `f + 1` unique oracles signed

## Contracts

```
contracts/data-streams/verifier/
├── contract.tolk     Main contract — message handlers, verification logic, getters
├── types.tolk        VerifierConfig struct, constants (MAX_NUM_ORACLES, ORACLE_MASK)
├── errors.tolk       Error enum (15 error codes)
├── messages.tolk     Incoming message struct definitions and opcodes
├── storage.tolk      Persistent state layout (Ownable2Step + configs dictionary)
└── cell_reader.tolk  EVM ABI parsing across TON's cell tree, multi-cell keccak256
```

## Setup

**Requirements:** Node.js v22+ (required — `zlib.crc32` used across wrappers was added in Node 22.2.0)

```bash
cd contracts
yarn install
```

## Build

```bash
npx blueprint build Verifier
```

Output: `build/Verifier.compiled.json`

## Test

```bash
# Functional tests (47 tests)
npx jest tests/data-streams/verifier/Verifier.spec.ts --no-coverage

# Gas benchmarks (9 tests)
npx jest tests/data-streams/verifier/GasBenchmarks.spec.ts --no-coverage

# Both
npx jest tests/data-streams/verifier/ --no-coverage
```

## Gas Costs

| Operation | Gas | TON Fee |
|---|---|---|
| setConfig (4 signers, f=1) | 13,729 | ~0.001 TON |
| setConfig (16 signers, f=5) | 62,906 | ~0.004 TON |
| setConfig (31 signers, f=10) | 133,415 | ~0.009 TON |
| verify (f=1, 2 signatures) | 107,237 | ~0.007 TON |
| verify (f=5, 6 signatures) | 211,017 | ~0.014 TON |
| updateConfig (16 signers) | 126,912 | ~0.008 TON |

## Format

```bash
yarn fmt:check   # check
yarn fmt         # auto-fix
```
