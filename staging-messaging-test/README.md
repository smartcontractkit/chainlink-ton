# CCIP Staging Messaging Tests

End-to-end validation for CCIP messaging between (currently only) TON and EVM chains.

## Quick Start

```bash
# Copy environment template
cp env.example .env
# Edit .env with your values

# Run single direction
./run_test.sh TON2EVM
./run_test.sh EVM2TON

# Or use Go directly
go test -v -run Test_TON2EVM ./tests
go test -v -run Test_EVM2TON ./tests
```

## Structure

```
staging-messaging-test/
├── cmd/check_balance/     # Balance checker utility
├── lib/                   # Chain clients (evm/, ton/)
├── tests/                 # Test files per direction
├── run_test.sh           # Test runner
└── env.example           # Environment template
```

## Environment Variables

Local `.env` file (see `env.example`):

```bash
# Chain selectors
TON_TESTNET_SELECTOR=1399300952838017768
ETHEREUM_TESTNET_SEPOLIA_SELECTOR=16015286601757825753

# TON configuration
TON_TESTNET_ROUTER=EQDtF...
TON_TESTNET_RECEIVER=EQDtF...
TON_TESTNET_WALLET_KEY=word1 word2 ... word24
TON_TESTNET_ENDPOINT=https://ton.org/testnet-global.config.json

# EVM configuration
ETHEREUM_TESTNET_SEPOLIA_ROUTER=0xabc...
ETHEREUM_TESTNET_SEPOLIA_RECEIVER=0xdef...
ETHEREUM_TESTNET_SEPOLIA_WALLET_KEY=0123456789abcdef...
ETHEREUM_TESTNET_SEPOLIA_ENDPOINT=https://ethereum-sepolia-rpc.publicnode.com
```

## GitHub Actions

Runs both test directions in parallel using matrix. Repository settings:

**Variables:**
- `TON_TESTNET_SELECTOR`
- `ETHEREUM_TESTNET_SEPOLIA_SELECTOR`

**Secrets:**
- `STAGING_TON_TESTNET_ROUTER`
- `STAGING_TON_TESTNET_RECEIVER`
- `STAGING_TON_TESTNET_WALLET_KEY`
- `STAGING_TON_TESTNET_ENDPOINT`
- `STAGING_ETHEREUM_TESTNET_SEPOLIA_ROUTER`
- `STAGING_ETHEREUM_TESTNET_SEPOLIA_RECEIVER`
- `STAGING_ETHEREUM_TESTNET_SEPOLIA_WALLET_KEY`
- `STAGING_ETHEREUM_TESTNET_SEPOLIA_ENDPOINT`
- `STAGING_TEST_SLACK_WEBHOOK`

## Architecture

### Client Interface

All chain clients implement:

```go
type Client interface {
    ChainSelector() uint64
    SendMessage(ctx, lggr, msg) (*SendResult, error)
    WaitForMessageReceived(ctx, lggr, receiver, messageID, data, startBlock) error
    GetCurrentBlock(ctx) (uint64, error)
    GetBalance(ctx, address) (string, error)
}
```

Register new chains:

```go
lib.RegisterClientFactory(chainsel.FamilyXYZ, NewXYZClient)
```

### Adding a Test Direction

1. Create `tests/xyz2abc_msg_test.go`
2. Add to workflow matrix: `direction: [ton2evm, evm2ton, xyz2abc]`
3. Done

### Balance Checker

```bash
go run ./cmd/check_balance <selector> <address>
# Returns JSON with balance
```
