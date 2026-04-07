---
id: contracts-ccip-offramp-merkle-root
slug: merkle-root
title: MerkleRoot
sidebar_label: MerkleRoot
sidebar_position: 4
---

# MerkleRoot

The MerkleRoot contract is deployed once per committed root. It tracks execution state for every message sequence number covered by that root and acts as the gatekeeper for retries. The OffRamp uses it to prove that a message belongs to a committed report before creating or reusing a `ReceiveExecutor`.

Each message state is stored in a packed two-bit bitmap keyed by sequence number offset. A single MerkleRoot can track up to 64 messages.

```mermaid
graph LR
    OFR["OffRamp"]
    MR["MerkleRoot"]
    RE["ReceiveExecutor"]

    OFR -->|Commit deploys root| MR
    OFR -->|Validate| MR
    MR -->|ExecuteValidated| OFR
    OFR -->|MarkState Success / Failure| MR
    OFR -->|Create or retry executor| RE
```

## State Machine

The state machine is per message, not per contract.

```mermaid
stateDiagram-v2
    [*] --> Untouched
    Untouched --> InProgress: Validate
    InProgress --> Success: MarkState(Success)
    InProgress --> Failure: MarkState(Failure)
    Failure --> InProgress: Validate retry
    Success --> [*]
```

## Transition Rules

- `Untouched -> InProgress`: the OffRamp sends `Validate` after checking the execute report. Normal DON execution is only allowed from `Untouched`.
- `InProgress -> Success`: the OffRamp calls `MarkState(Success)` after the `ReceiveExecutor` confirms delivery.
- `InProgress -> Failure`: the OffRamp calls `MarkState(Failure)` after a bounced delivery or failed execution path.
- `Failure -> InProgress`: a retry is allowed when execution previously failed. Manual execution can also retry an old untouched message once the permissionless threshold has passed.
- `Success` is terminal: the contract rejects any later transition away from success.

## Root Lifecycle

```mermaid
sequenceDiagram
    participant OFR as OffRamp
    participant MR as MerkleRoot

    OFR ->> MR: Validate { message, metadataHash }
    Note over MR: Check current state for sequence number
    Note over MR: Allow Untouched for DON execution
    Note over MR: Allow Failure or stale Untouched for manual retry
    MR ->> OFR: ExecuteValidated
    OFR ->> MR: MarkState { seqNum, Success | Failure }
    Note over MR: Increment delivered count on Success
    Note over MR: Freeze and return balance once all messages are successful
```

The root only freezes when every message in its interval has eventually reached `Success`. Failed messages keep the root alive so they can be retried.