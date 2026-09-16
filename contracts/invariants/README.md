# TON Contract Invariants

This directory contains TON contract invariants that are independent of any
single product. CCIP-on-TON invariants live in [ccip](ccip/).

General CCIP specifications and chain-agnostic CCIP invariants are maintained in
the [chainlink-ccip repository](https://github.com/smartcontractkit/chainlink-ccip/tree/main/chains/evm/contracts/invariants/). The files here cover TON-specific properties
that remain true across products, libraries, bindings, and tooling.

Implementation context lives in the contract docs:

- [TON contract invariant context](../../docs/contracts/invariants.md)
- [CCIP-on-TON invariant context](../../docs/contracts/overview/ccip/invariants.md)
- [CCIP overview](../../docs/contracts/overview/ccip/index.md)
- [Deployable](../../docs/contracts/overview/deployable.md)

## Invariant Files

| File                                                         | Scope                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [AUTHORIZATION_INVARIANTS.md](AUTHORIZATION_INVARIANTS.md)   | Product-agnostic TON sender, value, async, bounce, deterministic-address, and upgrade authorization properties |
| [BINDING_SAFETY_INVARIANTS.md](BINDING_SAFETY_INVARIANTS.md) | Product-agnostic Tolk, generated TypeScript wrapper, and handwritten Go binding compatibility properties       |
| [TON_LINT_INVARIANTS.md](TON_LINT_INVARIANTS.md)             | Product-agnostic TON/Tolk static-review properties and current tooling boundaries                              |
| [ccip/](ccip/)                                               | CCIP product invariants whose TON implementation differs from or extends chain-agnostic CCIP invariants        |
