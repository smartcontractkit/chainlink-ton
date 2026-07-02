# CCIP-on-TON Invariants

This directory contains CCIP product invariants whose TON implementation has
chain-specific behavior. Chain-agnostic CCIP invariants remain in the
[chainlink-ccip repository](https://github.com/smartcontractkit/chainlink-ccip/tree/main/chains/evm/contracts/invariants/). Product-agnostic TON invariants remain in the
parent directory.

Implementation context:

- [CCIP-on-TON invariant context](../../../docs/contracts/overview/ccip/invariants.md)
- [CCIP overview](../../../docs/contracts/overview/ccip/index.md)
- [CCIP flow](../../../docs/contracts/overview/ccip/flow.md)
- [Deployable](../../../docs/contracts/overview/deployable.md)

## Invariant Files

| File                                                         | Scope                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [AUTHORIZATION_INVARIANTS.md](AUTHORIZATION_INVARIANTS.md)   | CCIP-on-TON sender, callback, bounce, upgrade, and trust-boundary properties            |
| [BINDING_SAFETY_INVARIANTS.md](BINDING_SAFETY_INVARIANTS.md) | CCIP-on-TON message, report, event, getter, address, and codec compatibility properties |
