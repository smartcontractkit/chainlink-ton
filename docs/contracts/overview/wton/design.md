---
id: contracts-overview-wton-design
title: Design
sidebar_label: Design
sidebar_position: 1
---

# wTON - Design

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
- Burn payouts are protocol-critical, not best-effort. The minter sends the payout to `sendExcessesTo` under `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL`. If the action phase fails — either because RAWRESERVE cannot keep the minter's rent reserve intact (post-msg balance below the floor) or because the subsequent payout send would push the balance below the just-set reserve floor — the transaction reverts, the compute-phase `totalSupply` decrement is undone, the burn notification bounces back to the wallet, and the wallet's `onBouncedMessage` restores the burned `jettonBalance`. Net effect: the burner keeps their wTON and no TON is moved. The recipient's compute-phase failure (i.e., a non-bounceable destination that throws on receive) is _not_ an action-phase failure for the minter — with `BounceMode.NoBounce` the TON is still deposited at the recipient address even if its code throws.

## Jetton Version

Base Jetton Tolk implementation from <https://github.com/ton-blockchain/tolk-bench/tree/master/contracts_Tolk/03_notcoin> at [57e1009](https://github.com/ton-blockchain/tolk-bench/commit/57e1009743bfc19748caa95d76180d9e9793e4c5)

**Why this version?**

<https://docs.ton.org/blockchain-basics/standard/tokens/jettons/comparison#notcoin-contract>

> ## Notcoin contract
>
> This version is straightforward - it is a forked Stablecoin contract with removed governance functionality and added burn mechanism. Until recent times, it was the most suitable Jetton for basic on-chain coin use cases.

Which is exactly what we need as a base for wTON (and CCTs), and the [ton-blockchain/tolk-bench](https://github.com/ton-blockchain/tolk-bench) is implemented in latest Tolk 1.4 and brings substantial gas improvements over using FunC originals.
