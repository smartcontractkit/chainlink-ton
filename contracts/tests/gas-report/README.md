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
yarn gas-report-cct               # -> tests/gas-report/cct-gas-report.json
yarn gas-report-wgram             # -> tests/gas-report/wgram-gas-report.json
yarn gas-report-burn-mint-cct     # -> tests/gas-report/burn-mint-cct-gas-report.json
yarn gas-report-lock-release-wgram
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
│       ├── OnRamp.spec.ts    # Sender account deployment, deposit, CCIPSend with tokens at its min value, data size sweep
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
GAS_REPORT_NETWORK=default yarn gas-report-ccip   # bundled sandbox config, works offline
yarn gas-report-ccip                               # mainnet config (default), fetched from the network
yarn gas-report-ccip:md                            # merges the snapshots into docs/contracts/overview/ccip/gas-report.md
```

Run it inside `nix develop .#contracts`. `GAS_REPORT_NETWORK` is `mainnet`, `testnet` or `default`;
snapshots are written per network and are gitignored; the merged `gas-report.md` is the committed artifact.

## Adding New Test Cases

Create a `GasReport` once the blockchain exists, run each flow through `measure`, and call
`finish()` in `afterAll` to write the snapshot and drop the setup transactions from
`ccip-gas-report.json`:

```typescript
import { AddressBook, BalanceRule, GasReport, gasReportConfig } from '../../utils'

describe('Your Test Suite', () => {
  let report: GasReport
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    // Frozen time: no storage fees, so per-transaction balance deltas are exact.
    blockchain.now = 1
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
      // Balance changes expected on top of the structural exemptions (see below).
      retains: [
        // Exact delta: the executor keeps exactly the deployment value it was seeded with.
        {
          contract: 'Executor',
          op: 'Deployable.initialize',
          kind: 'deltaExact',
          delta: 9_910_532n,
        },
        // Bounded delta: the Router keeps the route margin, at most 0.05 TON.
        {
          contract: 'Router',
          op: 'Router_RouteMessage',
          kind: 'deltaRange',
          min: 0n,
          max: toNano('0.05'),
        },
        // Rules may also be scoped to one `from`, and may read the flow's hops:
        {
          contract: 'MerkleRoot',
          op: 'MerkleRoot_MarkState',
          kind: 'deltaExact',
          delta: (ctx) => ctx.hop('MerkleRoot_MarkState').tx.value! - 258_468n,
        },
      ],
    })
  })
})
```

Every address in a measured flow must be in the `AddressBook` with an owner: `ccip` (Router, ramps,
executors, deposit accounts, MerkleRoot, FeeQuoter), `registry` (TokenAdminRegistry and entries),
`token` (pools, lockboxes, minters, jetton wallets) or `external` (users, receivers, transmitters).
`measure` fails on unknown addresses, on unexpected aborted hops, on a mismatch between the computed
balance changes and the real ones, when a `ccip` or `registry` contract ends the flow with less
balance than it started with (storage fees aside), unless it was drained on purpose, and on any
transaction whose receiving contract's balance changed without a satisfying `retains` rule (see
below).

### Per-transaction balance invariant

`measure` steps through the flow one transaction at a time and checks the receiving contract's
balance before and after each hop. With `blockchain.now` frozen (the spec must set
`blockchain.now = 1`) no storage fees are charged, so a handler that passes the message value
forward ends with a delta of exactly 0. Any other outcome fails the flow unless the hop is
structurally exempt — aborted transactions, deployments (account uninitialized before),
destructions, or `external`-owned receivers (value sinks by design) — or covered by a `retains`
rule. Bounces are NOT exempt: how a handler (or the TVM) routes the bounced value must be covered
by a rule. Most message handlers should pass the value forward — a non-exempt balance change means
the contract is silently keeping (or funding) value, which is a value sink to fix or refund.

A `retains` rule is `{ contract, op, from?, bounce?, optional? }` plus exactly one amount
constraint. The selector is precise: `op` is mandatory, so each rule matches exactly the one
message it names (use `from` to disambiguate repeated (contract, op) pairs). For a bounced message
the `op` names the ORIGINAL message that bounced — the op is recovered from the bounce body (the
32 bits after the `0xffffffff` simple-bounce prefix, or the original body cell of a `0xfffffffe`
rich bounce) — and `bounce: 'simple' | 'rich'` restricts the rule to bounces of that kind (`null`
matches only non-bounced messages; omitted matches both). An `optional` rule may go unexercised
without failing the flow (it must still match a hop): use it for hops that only sometimes retain
value, e.g. a jetton wallet keeping its storage reserve on the transfer that deploys it.

- `kind: 'deltaExact'` / `'deltaRange'` — the hop's balance delta must equal `delta`, or fall
  within `[min, max]` (either bound may be omitted, but at least one must be given — a range rule
  without bounds throws).
- `kind: 'balanceExact'` / `'balanceRange'` — same, but `value`/`[min, max]` are checked against
  the contract's absolute balance after the hop.
- Amounts are `bigint` or a `(ctx: BalanceContext) => bigint` function; `ctx` exposes the flow's
  `hops`, `hop(op, occurrence?)` and `delta(contract, op?)` for rules that depend on other hops.
  Each hop carries the flattened transaction (`hop.tx` from `@ton/test-utils`), so rules can read
  the message value (`tx.value`), opcodes (`tx.op`), phases (`tx.exitCode`, `tx.actionResultCode`)
  and more.

The invariant enforced on every flow:

1. **Every balance-changing hop needs a satisfying rule.** A hop whose balance changed is covered
   only if a rule's selector (`contract` + `op` + optional `from`/`bounce`) matches it _and_ its
   amount constraint holds; otherwise the hop is reported in `balanceChanges` and the test fails.
2. **Every rule must match at least one hop of the flow.** Rules are matched against all hops, not
   just violations — a rule for an op whose delta is 0, or whose hop is structurally exempt, still
   counts as matched. A rule that matches nothing is reported in `unmatchedRules` and the test
   fails (this catches silent drift after op renames).
3. **External-owned receivers are always exempt** — they are value sinks by design and need no
   rules.
4. **`blockchain.now = 1` (frozen time) is required** — otherwise storage fees make per-hop deltas
   non-deterministic and the exact rules meaningless.

Flows whose label starts with `sweep:` are reported in the data size section only and never count
towards the worst case of an entrypoint.

## Flow Analysis

`measure` prints one row per transaction of the flow, in execution order:

| Column      | Description                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------- |
| `From`/`To` | Sender and receiver of the incoming message                                                 |
| `Owner`     | Owner of the receiving contract (see above)                                                 |
| `Op`        | Incoming message name (from the generated wrappers); for bounces, the original message name |
| `Gas`       | Gas used by the compute phase                                                               |
| `Compute`   | Compute fee (TON)                                                                           |
| `Storage`   | Storage fee collected (TON)                                                                 |
| `Fwd (out)` | Full forward fees of the outgoing messages (TON)                                            |
| `Cost`      | Storage + compute + forward fees: what the hop costs the value flowing through              |
| `Value in`  | TON carried by the incoming message                                                         |
| `Value out` | TON carried by the outgoing messages                                                        |
| `Retained`  | Balance change of the receiving contract                                                    |
| `Exit`      | Compute exit code, or `FAIL <code>` / `FAIL action <code>` when aborted                     |

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
