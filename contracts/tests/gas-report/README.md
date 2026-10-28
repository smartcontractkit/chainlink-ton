# Gas Report Tests

This directory contains gas usage benchmarks for TON smart contracts using the `@ton/sandbox` Metrics API.

## Token & token-pool calibration

The token fee guards (`cct/fees-management.tolk`, `wgram/fees-management.tolk`) and the token-pool
budgets (`pools/lib/token_pool/recovery.tolk`, `pools/burn_mint/types.tolk`) are **pinned to
measured gas**. A covered-path change that moves gas fails these tests, so the funding assumptions
cannot silently drift.

- `token/gas.ts` — shared runner `runTokenGasCalibration`: deploys a token, does mint / transfer /
  burn, asserts measured gas == the on-chain `GAS_CONSUMPTION_*` constants.
- `token/cct.spec.ts`, `token/wgram.spec.ts` — the two token fixtures.
- `pools/gas.ts` — shared runner `runTokenPoolGasCalibration`: deploys a pool, configures the lane,
  drives a full `LockOrBurn` + `ReleaseOrMint`, asserts the admission/safety floors cover the pool
  handlers and the on-chain token-hop budget covers the measured wallet hop (in TON).
- `pools/burn_mint_cct.spec.ts`, `pools/lock_release_wgram.spec.ts` — the two pool fixtures.
- `harness.ts` — deploys the test-only `CctCostHarness` / `WgramCostHarness` contracts, which expose
  the on-chain constants/budget functions as getters. Tests read the on-chain values through these
  instead of duplicating numbers or parsing Tolk source.

Each suite writes an isolated report (the reporter groups by ABI name, and CCT/wGRAM share
`JettonMinter`/`JettonWallet`, so they must run separately):

```bash
yarn cct-gas-report               # -> tests/gas-report/cct-gas-report.json
yarn wgram-gas-report             # -> tests/gas-report/wgram-gas-report.json
yarn burn-mint-cct-gas-report     # -> tests/gas-report/burn-mint-cct-gas-report.json
yarn lock-release-wgram-gas-report
```

The harness smoke test lives in the normal suite: `tests/gas/harness.spec.ts`.

## CCIP message-flow gas report

## Structure

```
tests/gas-report/
├── constants.ts          # Common test constants (chain selectors, addresses)
├── utils.ts              # Flow analysis, owner attribution, balance checks, snapshots (GasReport)
├── ccip/
│   ├── opNames.ts        # Opcode -> message name map built from the generated wrappers
│   ├── snapshots/        # Per-spec JSON written by GasReport (<spec>.<network>.json)
│   ├── messaging/        # Arbitrary messaging flows (no tokens)
│   │   ├── OnRamp.spec.ts    # CCIPSend at its min value with a MAX_DATA_CELLS payload, plus a data size sweep
│   │   ├── OffRamp.spec.ts   # Commit and execute of a max payload message
│   │   ├── FeeQuoter.spec.ts # Fee validation at its min value, FeeQuoter gas by payload size
│   │   └── config.ts         # Payload sizes and builders
│   └── tokens/           # Token transfer flows, per pool type (LockRelease, BurnMint)
│       ├── OnRamp.spec.ts    # OnRamp account deployment, deposit, CCIPSend with tokens at its min value, data size sweep
│       ├── OffRamp.spec.ts   # Execute of token transfers (new/existing receiver account, gasLimit 0, max payload)
│       ├── pools.ts          # CCT jetton + token pool fixture
│       ├── TokenAdminRegistryFlows.spec.ts, TokenInfoQuery.spec.ts, JettonWalletQuery.spec.ts
│       │                     # TokenAdminRegistry flows run at their min values (see Costs in wrappers/ccip/TokenAdminRegistry.ts)
│       └── snapshots/        # Snapshots of the TokenAdminRegistry specs
└── README.md
```

## How to Run

```bash
yarn build
GAS_REPORT_NETWORK=default yarn ccip-gas-report   # bundled sandbox config, works offline
yarn ccip-gas-report                               # mainnet config (default), fetched from the network
yarn ccip-gas-report:md                            # merges the snapshots into docs/contracts/overview/ccip/gas-report.md
```

Run it inside `nix develop .#contracts`. `GAS_REPORT_NETWORK` is `mainnet`, `testnet` or `default`;
snapshots are written per network and are gitignored; the merged `gas-report.md` is the committed artifact.

## Adding New Test Cases

Create a `GasReport` once the blockchain exists, run each flow through `measure`, and call
`finish()` in `afterAll` to write the snapshot and drop the setup transactions from
`ccip-gas-report.json`:

```typescript
import { AddressBook, GasReport, gasReportConfig } from '../../utils'

describe('Your Test Suite', () => {
  let report: GasReport
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    report = new GasReport('your-spec', blockchain)
  })

  it('should measure gas usage', async () => {
    const { result, flow } = await report.measure('Your Flow', {
      run: () => router.sendRouterCCIPSend(sender.getSender(), value, msg),
      book: new AddressBook({ Sender: [sender, 'external'], Router: [router, 'ccip'] }),
      // Names addresses only known after the run, e.g. executors.
      discover: (result, book) => book.set('Executor', findExecutor(result), 'ccip'),
      // Hops expected to fail, as From->To.
      aborts: [],
    })
  })
})
```

Every address in a measured flow must be in the `AddressBook` with an owner: `ccip` (Router, ramps,
executors, deposit accounts, MerkleRoot, FeeQuoter), `registry` (TokenAdminRegistry and entries),
`token` (pools, lockboxes, minters, jetton wallets) or `external` (users, receivers, transmitters).
`measure` fails on unknown addresses, on unexpected aborted hops, on a mismatch between the computed
balance changes and the real ones, and when a `ccip` or `registry` contract ends the flow with less
balance than it started with (storage fees aside), unless it was drained on purpose.

Flows whose label starts with `sweep:` are reported in the data size section only and never count
towards the worst case of an entrypoint.

## Flow Analysis

`measure` prints one row per transaction of the flow, in execution order:

| Column      | Description                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| `From`/`To` | Sender and receiver of the incoming message                                    |
| `Owner`     | Owner of the receiving contract (see above)                                    |
| `Op`        | Incoming message name (from the generated wrappers), `bounced`, `external`     |
| `Gas`       | Gas used by the compute phase                                                  |
| `Compute`   | Compute fee (TON)                                                              |
| `Storage`   | Storage fee collected (TON)                                                    |
| `Fwd (out)` | Full forward fees of the outgoing messages (TON)                               |
| `Cost`      | Storage + compute + forward fees: what the hop costs the value flowing through |
| `Value in`  | TON carried by the incoming message                                            |
| `Value out` | TON carried by the outgoing messages                                           |
| `Retained`  | Balance change of the receiving contract                                       |
| `Exit`      | Compute exit code, or `FAIL <code>` / `FAIL action <code>` when aborted        |

It is followed by the cost per owner and by the entrypoint table: for every hop into a `ccip`
contract, the cost of that hop plus everything downstream of it (using the sandbox transaction
tree), split by owner. The `CCIP` column of an entrypoint is the cost its min value has to cover;
the `Registry` and `Token` columns are covered by those contracts' own budgets. `Gas eq` converts
the total to gas units at the config's gas price. A min value is set to 3x the measured compute
and storage plus 2x the measured forward fees of the CCIP subtree (`minValueBasis` in `utils.ts`);
`measure` asserts this when a `budget` is given.

The TokenAdminRegistry specs use the receiver-attributed `txFee` helper (incoming forward fee plus
own fees) instead; both attributions add up to the same flow total.

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
