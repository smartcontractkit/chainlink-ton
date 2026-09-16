---
id: contracts-ccip-index
title: CCIP
sidebar_label: Overview
sidebar_position: 1
---

# CCIP

This section documents the TON-specific CCIP contract design, including the token registry and the message flow across onramp and offramp components.

## Contract Interaction

```mermaid
graph LR
    R["Router"]
    OR["OnRamp"]
    OFR["OffRamp"]
    SE["SendExecutor"]
    FQ["FeeQuoter"]
    MR["MerkleRoot"]
    RE["ReceiveExecutor"]

    click R "./router" "Open Router docs"
    click OR "./onramp" "Open OnRamp docs"
    click OFR "./offramp" "Open OffRamp docs"
    click SE "./onramp/send-executor" "Open Send Executor docs"
    click FQ "./fee-quoter" "Open Fee Quoter docs"
    click MR "./offramp/merkle-root" "Open Merkle Root docs"
    click RE "./offramp/receive-executor" "Open Receive Executor docs"

    R <--> OR
    R <--> OFR
    OR <--> SE
    SE <--> FQ
    OFR <--> MR
    OFR <--> RE
```

## Contracts Reference

- [Router](./router/index.md)
- [OnRamp](./onramp/index.md)
  - [Send Executor](./onramp/send-executor.md)
- [OffRamp](./offramp/index.md)
  - [Receive Executor](./offramp/receive-executor.md)
  - [Merkle Root](./offramp/merkle-root.md)
- [FeeQuoter](./fee-quoter.md)
- [Token Pools](./token-pools/index.md)

## Topics

- [Flow Overview](./flow.md)
- [Token Transfer Notation Convention](./token-transfer-notation-convention.md)
