---
id: contracts-ton-patterns
title: TON Patterns
sidebar_label: TON Patterns
sidebar_position: 9
---

# TON Patterns

This document describes design patterns that we have found useful in TON smart contracts.

## Annotation Conventions

Privileged handlers use an `AUTHORIZED` comment near the match arm or handler:

```tolk
// AUTHORIZED: <authorization mechanism> (<authorized sender or trust root>). [<explanation/rationale>] (optional)
```

Common authorization mechanisms are:

- `STORED_ADDRESS`: `in.senderAddress` is compared to an address stored in
  state or configuration.
- `DERIVED_ADDRESS`: the expected sender is derived from trusted code and
  reconstructed initial state.

Examples

```tolk
// AUTHORIZED: STORED_ADDRESS (st.ownable.owner).
// AUTHORIZED: STORED_ADDRESS (st.config.feeQuoter).
// AUTHORIZED: DERIVED_ADDRESS (st.executor.deployableCode, executorID, OnRamp owner). SendExecutor can only reach this state through a trusted OnRamp path.
```

The comment is descriptive only; the authorization is the actual
`in.senderAddress` check, owner/admin helper, or deterministic address
derivation in the handler.

Permissionless handlers use a `PERMISSIONLESS` comment near the match arm or
handler:

```tolk
// PERMISSIONLESS: <reason this message is safe for any sender>
```

The reason identifies the safety mechanism, such as read-only behavior,
fee-gating, bounded value transfer, signed/content validation, or downstream
authorization.

## TON Value Sending

Every internal TON message carries value. Value forwarding is not automatically
privileged when the handler can only spend inbound value or explicitly reserved
excess balance.

Permissionless value sends are bounded by one of these patterns:

- `in.valueCoins` covers a fixed outbound value plus benchmarked gas for the
  largest supported message body.
- `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE` forwards only inbound value left
  after gas fees.
- `reserveToncoinsOnBalance(..., RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE)`
  precedes `SEND_MODE_CARRY_ALL_BALANCE`, preserving the original contract
  balance.

Handlers that can send more value than these bounded patterns allow are
value-privileged and are covered by authorization invariants.

## Tooling Boundaries

Acton is configured in `contracts/Acton.toml`. Its `unauthorized-access`
(`E013`) rule is set to `deny` and detects storage mutations such as
`contract.setData(...)` and `*.save()` reachable without a preceding admin
sender check. Acton does not support custom lint rules.

`scripts/oplint` is a standalone opcode checker. It checks that Tolk struct
opcodes match CRC32 struct-name values, except documented `nolint:opcode`
cases. It does not check Go bindings, TypeScript wrappers, serialization
compatibility, authorization, or broader lint safety.

## Bindings

Generated TypeScript wrappers live under `contracts/wrappers/gen`. They are
generated from Tolk and are not manually edited.

Go bindings under `pkg/ccip/bindings` are handwritten. Handwritten bindings and
Go codecs have higher drift risk because they are not generated from the Tolk
ABI.
