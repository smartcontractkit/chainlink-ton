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
