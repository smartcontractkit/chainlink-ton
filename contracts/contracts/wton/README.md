# Wrapped TON

A token escrow protocol to make TON behave as Jetton in a new asset called wTON.

**Features:**

- Standard Jetton [TEP #74](https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md) minimal deviation
- No admin:
  - Mint (new) wTON by providing TON
  - Burn wTON to withdraw TON
- Base Jetton Tolk implementation from <https://github.com/ton-blockchain/tolk-bench/tree/master/contracts_Tolk/03_notcoin> at [57e1009](https://github.com/ton-blockchain/tolk-bench/commit/57e1009743bfc19748caa95d76180d9e9793e4c5)

**Why this version?**

<https://docs.ton.org/blockchain-basics/standard/tokens/jettons/comparison#notcoin-contract>

> ## Notcoin contract
>
> This version is straightforward - it is a forked Stablecoin contract with removed governance functionality and added burn mechanism. Until recent times, it was the most suitable Jetton for basic on-chain coin use cases.

Which is exactly what we need as a base for wTON (and CCTs), and the [ton-blockchain/tolk-bench](https://github.com/ton-blockchain/tolk-bench) is implemented in latest Tolk 1.4 and brings substantial gas improvements over using FunC originals.

## Design

wTON is a fully backed Jetton wrapper around TON:

- Minting funds the recipient wallet with the TON backing and issues the same amount of wTON there.
- Burning destroys wTON in the wallet and routes the withdrawn TON back to the chosen payout destination via the minter.
- Transfers move both the wTON balance and its TON backing between wTON wallets.
- Transfers stay Jetton-compatible, so ordinary Jetton tooling can interact with wTON wallets.

The implementation keeps the protocol surface intentionally small:

- `JettonMinter.tolk` tracks total supply, serves wallet-address requests, dispatches mint funding into wallets, and settles burn withdrawals.
- `JettonWallet.tolk` holds user balances, escrows the per-wallet TON backing, enforces owner-only transfer and burn requests, and processes incoming internal transfers.
- `fees-management.tolk` contains the storage, forward-fee, and gas constants that the runtime checks use to reject underfunded mint, transfer, and burn messages before balances move.

The main behavior differences from a generic Jetton are deliberate:

- wTON has no admin controls after deployment.
- Workflows are restricted to `MY_WORKCHAIN` so fee budgeting and refund paths stay deterministic.
- Mint bounce refunds are best-effort: supply is restored first, and any refund send is attempted with `IGNORE_ERRORS` rather than treated as protocol-critical.

### Gas Reporter And Fee Constants

The fee guards in `fees-management.tolk` must stay aligned with the measured live paths covered by [tests/gas-report/wton/Wton.spec.ts](../../tests/gas-report/wton/Wton.spec.ts).

From [contracts/package.json](../../package.json), run the dedicated reporter from the `contracts` workspace:

```sh
cd /Users/krebernisak/Developer/main/chainlink-ton/contracts
yarn wton-gas-report
```

This suite measures the worst covered execution branches and compares them against the constants in [contracts/contracts/wton/fees-management.tolk](./fees-management.tolk):

- `GAS_CONSUMPTION_JettonTransfer`
- `GAS_CONSUMPTION_JettonReceive`
- `GAS_CONSUMPTION_BurnRequest`
- `GAS_CONSUMPTION_BurnNotification`
- `MESSAGE_SIZE_BurnNotification_*`
- `MESSAGE_SIZE_ReturnExcesses_*`

When the reporter fails after a contract-path change:

1. Re-run `yarn wton-gas-report` and read the measured values printed by the failing test.
2. Update the matching constants in [contracts/contracts/wton/fees-management.tolk](./fees-management.tolk).
3. Re-run `yarn wton-gas-report` until the measured values and configured constants match exactly.

Only update these constants after an intentional logic change on a covered path. If the numbers drift unexpectedly, treat that as a behavior change to review first, not just a docs-only constant refresh.
