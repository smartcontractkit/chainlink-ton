# Gas Report Tests

This directory contains gas usage benchmarks for TON smart contracts using the `@ton/sandbox` Metrics API.

## Structure

```
tests/gas-report/
├── constants.ts          # Common test constants (chain selectors, addresses)
├── utils.ts              # Gas analysis and table formatting utilities
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
import {
  Blockchain,
  fetchConfig,
  printTransactionFees,
  createMetricStore,
  makeSnapshotMetric,
  ContractDatabase,
  resetMetricStore,
} from '@ton/sandbox'
import { analyzeSnapshot, printFlowAnalysis } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'

// Load contract database for ABI mapping
const contractDatabasePath = path.join(__dirname, '../../../../contract.abi.json')
const contractDatabase = ContractDatabase.from(JSON.parse(fs.readFileSync(contractDatabasePath, 'utf8')))

// Initialize metric store
const store = createMetricStore()

describe('Your Test Suite', () => {
  let blockchain: Blockchain

  beforeAll(async () => {
    // Use testnet config for accurate fee calculation
    const config = await fetchConfig('testnet')
    blockchain = await Blockchain.create({ config })
    // Setup contracts...
  })

  it('should measure gas usage', async () => {
    // Reset before measurement
    resetMetricStore()

    // Execute your transactions
    const result = await contract.send(...)

    // Analyze with metrics API (contract/method level)
    const snapshot = makeSnapshotMetric(store, {
      contractDatabase,
      label: 'Your Flow',
    })
    const flowAnalysis = analyzeSnapshot(snapshot)
    printFlowAnalysis(flowAnalysis)

    // Optional: Print raw transaction fees for debugging
    console.log('\n=== RAW TRANSACTION FEES (for debugging) ===')
    printTransactionFees(result.transactions)
  })
})
```

3. The test will automatically be included in the gas report when running `yarn ccip-gas-report`

## Gas Analysis with Metrics API

The Metrics API provides **contract/method-level** gas analysis, perfect for comparing with staging:

### Example Output

```
=== ONRAMP FLOW ===

#    | Contract | Method       | Gas    | Compute (TON) | Forward (TON) | Action (TON) | Total (TON)
1    | Router   | sendCcipSend | 1,937  | 0.000774800   | 0.004432400   | 0.000000001  | 0.005207201
2    | Router   | Router_CCIP  | 4,101  | 0.001640400   | 0.004432400   | 0.000000001  | 0.006072801
...

=== FLOW SUMMARY ===

Total Transactions       : 7
Total Gas Used           : 52,305 units  ← Compare with staging!
Total Compute Fee        : 0.020922000 TON
Total Forward Fee        : 0.035899200 TON
Total Action Fee         : 0.000000007 TON
Total Fee                : 0.056821207 TON (56,821,207 nanotons)
```

### Key Functions

- **`analyzeSnapshot(snapshot)`** - Analyzes metrics and extracts gas usage per contract/method
- **`printFlowAnalysis(flow)`** - Prints formatted table with gas breakdown
- **`resetMetricStore()`** - Must call before measuring a flow to clear previous data

## Raw Transaction Fees (Debugging)

The `@ton/sandbox` also provides `printTransactionFees()` for raw transaction-level debugging:

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

**Key Column**: `inForwardFee` - The forward fee paid by the incoming message (useful for comparing with staging)

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
