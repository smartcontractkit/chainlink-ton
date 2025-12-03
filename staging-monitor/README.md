# CCIP Staging Monitor

End-to-end validation for CCIP functionality between TON and EVM chains. Includes messaging, token transfer, gas limit tests, and more.

## Quick Start

```bash
# Copy environment template
cp env.example .env
# Edit .env with your values

# Run tests using unified runner
go run ./cmd/run-test -case ton2evm-messaging  # TON → EVM messaging test
go run ./cmd/run-test -case evm2ton-messaging  # EVM → TON messaging test
```

## Structure

```
staging-monitor/
├── cases/                # Test case implementations
│   ├── ton2evm_messaging.go  # TON→EVM messaging test logic
│   └── evm2ton_messaging.go  # EVM→TON messaging test logic
├── cmd/
│   ├── run-test/        # Unified test runner (use -case flag)
│   └── send-slack/      # Slack notification sender
└── lib/                 # Chain clients (evm/, ton/), shared types
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
TON_TESTNET_FEE_QUOTER=EQAxX... # needed only for TON as source (EVM gets fee from Router)
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
- `STAGING_TON_TESTNET_FEE_QUOTER`
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

### Adding a Test Case

1. Create test case in `cases/xyz2abc_messaging.go`:

   ```go
   func XYZ2ABCMessaging(ctx context.Context, lggr logger.Logger) (*lib.TestResult, error) {
       result := &lib.TestResult{Case: "messaging-xyz2abc", Status: "failure"}
       // ... test logic ...
       result.Status = "success"
       return result, nil
   }
   ```

2. Add case to `cmd/run-test/main.go` switch statement:

   ```go
   case "xyz2abc":
       result, err = cases.XYZ2ABC(ctx, lggr)
   ```

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
