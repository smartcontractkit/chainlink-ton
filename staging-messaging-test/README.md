# CCIP Staging Messaging Tests

End-to-end validation for CCIP messaging between (currently only) TON and EVM chains.

## Quick Start

```bash
# Copy environment template
cp env.example .env
# Edit .env with your values

# Run tests
go run ./cmd/ton2evm  # TON → EVM test
go run ./cmd/evm2ton  # EVM → TON test
```

## Structure

```
staging-messaging-test/
├── cmd/
│   ├── ton2evm/          # TON→EVM test (standalone executable)
│   └── evm2ton/          # EVM→TON test (standalone executable)
├── lib/                  # Chain clients (evm/, ton/), shared types
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

Uses matrix strategy to run tests in parallel. Each test sends its own Slack notification. Repository settings:

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

1. Create new test command `cmd/xyz2abc/main.go` (copy from `cmd/ton2evm/main.go`)
2. Update chain selectors, case name, and log messages
3. Add to workflow matrix:
   ```yaml
   matrix:
     test: [ton2evm, evm2ton, xyz2abc]
   ```
4. Ensure required environment variables are set
5. Done - test runs independently in its own matrix job

### JSON Output

Each test outputs JSON with metrics:

```json
{
  "case": "messaging-ton2evm",
  "status": "success",
  "sender_address": "EQDtF...",
  "sender_balance": "10.5",
  "message_id": "abc123...",
  "latency_seconds": 45,
  "latency_formatted": "00:45",
  "router": "0x...",
  "receiver": "0x...",
  "data": "test-message"
}
```
