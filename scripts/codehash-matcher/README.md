# TON Contract Version Debugging Tool

Connects to TON testnet, queries a contract's code hash, and finds which GitHub release contains the matching contract code.

## Usage

```bash
go run main.go -address <CONTRACT_ADDRESS>
```

**Options:**
- `-address`: Contract address (required)
- `-liteserver`: Custom liteserver URL (optional)

**Example:**
```bash
go run main.go -address EQAfVSwJWVo9tbyCSd8XyXcVF83dg6dd-lY8RwyJs08T5Z2N
```

## Example Output

```
Contract: EQAfVSwJWVo9tbyCSd8XyXcVF83dg6dd-lY8RwyJs08T5Z2N
Code Hash: 0x91cef02e2c20304881087c58faddd93f08f516dc26b5c12e63cdf55f0fef4d47

Searching for matching release...

✅ Match found!
Contract: OnRamp
Release: TON Contracts Build (baef5397fb0d)
Published: 2025-09-26 14:30:25 UTC
Code Hash: 0x91cef02e2c20304881087c58faddd93f08f516dc26b5c12e63cdf55f0fef4d47
- See release at: https://github.com/smartcontractkit/chainlink-ton/releases/tag/ton-contracts-build-baef5397fb0d
- See commit: https://github.com/smartcontractkit/chainlink-ton/commit/baef5397fb0d
- Commit message: Add OnRamp contract with improved gas optimization
```

## How It Works

1. Queries contract's `codeHash` from TON testnet
2. Downloads GitHub releases from [smartcontractkit/chainlink-ton](https://github.com/smartcontractkit/chainlink-ton/releases)
3. Compares contract hashes from compiled JSON files
4. Returns matching release with links and commit details

## Common Issues

- **Connection errors**: Check internet connection or try custom liteserver
- **GitHub rate limits**: Wait a few minutes and retry
- **No match found**: Contract may be from unreleased build or different repo