# Gas Report Tests

This directory contains gas usage benchmarks for TON smart contracts using the `@ton/sandbox` Metrics API.

## Structure

```
tests/gas-report/
├── constants.ts          # Common test constants (chain selectors, addresses)
├── ccip/
│   └── messaging/        # CCIP message passing tests
│       ├── OnRamp.spec.ts
│       ├── OffRamp.spec.ts
│       ├── config.ts      # Flow-specific configs
│       └── helpers.ts     # Flow-specific helper functions
└── README.md
```

## How to Run

```bash
yarn ccip-gas-report
```

## Adding New Test Cases

To add a new gas benchmark test:

1. Create a new directory under `tests/gas-report/ccip/` (e.g., `token-transfer/`)
2. Create your test file with the following pattern:

```typescript
import { Blockchain, printTransactionFees, fetchConfig } from '@ton/sandbox'
import '@ton/test-utils'

describe('Your Test Suite', () => {
  let blockchain: Blockchain

  beforeAll(async () => {
    // Use testnet config for accurate fee calculation
    const config = await fetchConfig('testnet')
    blockchain = await Blockchain.create({ config })

    // Setup contracts...
  })

  it('should measure gas usage', async () => {
    // Execute your transactions
    const result = await contract.send(...)

    // Print transaction fees
    console.log('\n=== YOUR FLOW TRANSACTION FEES ===')
    printTransactionFees(result.transactions)
  })
})
```

3. The test will automatically be included in the gas report when running `yarn ccip-gas-report`

## Fee Analysis with printTransactionFees

The `@ton/sandbox` provides `printTransactionFees()` function that displays detailed fee breakdown for each transaction:

### What is Displayed

| Column          | Description                                         |
| --------------- | --------------------------------------------------- |
| `op`            | Operation code (hex) or 'N/A' for external messages |
| `valueIn`       | TON amount received in the transaction              |
| `valueOut`      | TON amount sent out in the transaction              |
| `totalFees`     | Total fees paid (compute + forward + action)        |
| `inForwardFee`  | Forward fee paid for incoming message               |
| `outForwardFee` | Sum of forward fees for outgoing messages           |
| `outActions`    | Number of outgoing actions                          |
| `computeFee`    | Gas used × gas_price (400 nanotons/unit)            |
| `exitCode`      | VM exit code (0 = success)                          |
| `actionCode`    | Action phase result code                            |

### Key Points

- **`inForwardFee`**: This is what the transaction actually pays for the incoming message. This is the value we compare with staging transactions.
- **`outForwardFee`**: This is the sum of forward fees for messages sent out by this transaction (shown in action phase).
- **Testnet Config**: Use `fetchConfig('testnet')` when creating the blockchain to match actual testnet fee calculation.

### Example Output

```
┌─────────┬────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────┬────────────────┬──────────┬────────────┐
│ (index) │ op         │ valueIn        │ valueOut       │ totalFees      │ inForwardFee   │ outForwardFee  │ outActions │ computeFee     │ exitCode │ actionCode │
├─────────┼────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────┼────────────────┼──────────┼────────────┤
│ 0       │ 'N/A'      │ 'N/A'          │ '0.11 TON'     │ '0.006938 TON' │ 'N/A'          │ '0.004433 TON' │ 1          │ '0.000775 TON' │ 0        │ 0          │
│ 1       │ '10000002' │ '0.11 TON'     │ '0.103928 TON' │ '0.006139 TON' │ '0.002955 TON' │ '0.008185 TON' │ 1          │ '0.00341 TON'  │ 0        │ 0          │
└─────────┴────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────┴────────────────┴──────────┴────────────┘
```

## Gas Price Constants

TON fee constants from testnet config:

- **Gas Price** (config #21): `26214400 / 2^16 = 400 nanotons per gas unit`
- **Forward Fee** (config #25):
  - `lump_price`: 400000 nanotons (base fee)
  - `bit_price`: 400 nanotons per bit
  - `cell_price`: 40000 nanotons per cell

## References

- [TON Mainnet Config](https://tonviewer.com/config)
- [TON Testnet Config](https://testnet.tonviewer.com/config)
- [@ton/sandbox Metrics API](https://github.com/ton-org/sandbox)
