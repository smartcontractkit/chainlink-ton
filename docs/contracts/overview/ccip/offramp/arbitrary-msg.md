---
id: contracts-ccip-offramp-arbitrary-msg
title: Arbitrary Message Offramp Flow
sidebar_label: Arbitrary Messages
sidebar_position: 1
---

# Arbitrary Message OffRamp Flow

> See [how the ReceiveExecutor works](receive-executor.md) and [how the Token Registry is implemented](../token-pools/token-registry.md).

See also [MerkleRoot](./merkle-root.md) for the per-message execution state machine that drives retries and finalization, and [Token Transfer](./token-transfer.md) for messages that carry tokens.

```mermaid

graph LR
    OFR["OffRamp"]
    MR["MerkleRoot"]
    RE["ReceiveExecutor"]
    R["Router"]
    RCV["Receiver"]

    OFR -->|1. Validate| MR
    MR -->|2. ExecuteValidated| OFR
    OFR -->|3. InitExecute| RE
    RE -->|4. DispatchValidated| OFR
    OFR -->|5. RouteMessage| R
    R -->|6. Receiver_CCIPReceiveV2| RCV
    RCV -->|7. CCIPReceiveConfirm| R
    R -->|8. CCIPReceiveConfirm| OFR
```

```mermaid
sequenceDiagram
    participant R as Router
    participant OR as OffRamp



    Note over OR: RECEIVES from OCR transmitter Commit<br>{ queryId, reportContext, report, signatures }
    activate OR

    create participant MR as MerkleRoot{id}
    OR ->> MR: stateInit: Deployable {owner: OffRamp, id: rootId}<br>Init: {root, owner: OffRamp, expectedMessages: n}

    Note over OR: Verifies signatures and emits OCR3Base_Transmitted<br>{ocrPluginType, configDigest, sequenceNumber}
    Note over OR: emit: CommitReportAccepted {merkleRoot, priceUpdates}
    Note over OR: Sends UpdatePrices to FeeQuoter
    deactivate OR

    Note over OR: RECEIVES Execute { queryId, reportContext, report }<br>or ManuallyExecute { queryId, report, gasOverride }
    activate OR
    Note over OR: Execute only: emits OCR3Base_Transmitted<br>{ocrPluginType, configDigest, sequenceNumber}
    Note over OR: Verifies sourceChain is not cursed and is enabled
    Note over OR: Verifies the report shape (one message, token data, data size)
    Note over OR: Parses OffRamp_ExecutionContext: applies and validates<br>the manual gas overrides (rejects the transaction if invalid)
    Note over OR: Verifies the value covers the execution
    Note over OR: Calculates MerkleRootId<br>from MessageMetadataHash

    OR ->> MR: Validate { message, metadataHash, isManualExecution,<br>context, excessesTo }
    deactivate OR

    activate MR

    Note over MR: Verifies sender is OffRamp
    Note over MR: Verifies the message state: Untouched for the DON,<br>Failure or stale Untouched for a manual execution
    Note over MR: deployExecutor = Untouched or executor deploy pending
    Note over MR: Sets state: InProgress

    MR ->> OR: ExecuteValidated { message, root, metadataHash,<br>deployExecutor, context, excessesTo }
    deactivate MR

    activate OR
    Note over OR: Verifies sender is MerkleRoot
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: InProgress }
    Note over OR: Loads the context and builds the token transfer, if any

    create participant RE as ReceiveExecutor{id}
    OR ->> RE: Only when deployExecutor:<br>stateInit: Deployable {owner: OffRamp, id: execId}<br>Init: {owner: OffRamp, message, root,<br>execId, state: Untouched}
    OR ->> RE: InitExecute { root, header, effectiveGasLimit,<br>tokenTransfer, excesses }
    deactivate OR



    activate RE
    Note over RE: Verifies sender is OffRamp
    Note over RE: Verifies the value covers the execution
    Note over RE: Set state: Execute
    RE ->> OR: DispatchValidated { message, execId,<br>effectiveGasLimit, tokenAmounts }
    deactivate RE



    activate OR
    Note over OR: Verifies sender is ReceiveExecutor
    Note over OR: Verifies gasLimit is above minimum
    alt Gas limit too low
    OR -x RE: DispatchValidated bounces
    Note over RE: Set state: ExecuteFailed<br>(continues as the Failure Path below)
    else

    OR ->> R: RouteMessage { dest: receiver,<br>message: Receiver_CCIPReceiveV2 { execID,<br>message: { messageId,<br>sourceChain, sender, data, tokenAmounts },<br>receiverAccounts }
    deactivate OR



    activate R
    Note over R: Verifies sender is OffRamp
    Note over R: SENDS message to Receiver
    deactivate R
    end
```

See [user interface](../router/user-interface/receiver.md) for more details on communication between User and Router.

## Rejected Executions

An execution can be rejected at two points, and neither one leaves the message stuck:

- **Before the MerkleRoot is involved.** Invalid reports and invalid manual gas overrides make the
  `Execute` / `ManuallyExecute` transaction itself fail with the exit code of the check. Nothing
  changes on chain, and the message keeps its state.
- **After the MerkleRoot validated the message.** Anything that throws in `ExecuteValidated` (for
  example a message with an unsupported number of token transfers) reverts the whole OffRamp
  transaction, including the ReceiveExecutor deploy, and bounces back to the MerkleRoot. The root
  marks the message `Failure`, remembers that the executor still has to be deployed, and notifies
  the OffRamp, which emits the event and refunds the caller. The message can be manually executed
  right away, and that attempt deploys the executor.

```mermaid
sequenceDiagram
    participant OR as OffRamp
    participant MR as MerkleRoot{id}
    participant C as Caller

    MR ->> OR: ExecuteValidated { ..., deployExecutor }
    activate OR
    Note over OR: Throws (transaction reverted,<br>executor deploy included)
    OR -x MR: ExecuteValidated bounces
    deactivate OR

    activate MR
    Note over MR: Sets state: Failure
    Note over MR: deployExecutor: sets executor deploy pending
    MR ->> OR: ExecutionStateChanged { header, state: Failure, excessesTo }
    deactivate MR

    activate OR
    Note over OR: Verifies sender is MerkleRoot
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: Failure }
    OR ->> C: excesses
    deactivate OR
```

## Receive Confirmation Flow

The ExecutionStateChanged event for the final state is emitted only once the MerkleRoot has
committed that state, when it answers `MarkState` with `ExecutionStateChanged`.

### Happy Path

```mermaid
graph LR
    RCV["Receiver"]
    R["Router"]
    OFR["OffRamp"]
    RE["ReceiveExecutor"]
    MR["MerkleRoot"]
    C["Caller"]

    R -->|1. Receiver_CCIPReceiveV2| RCV
    RCV -->|2. CCIPReceiveConfirm| R
    R -->|3. CCIPReceiveConfirm| OFR
    OFR -->|4. CCIPReceiveConfirm| RE
    RE -->|5. NotifySuccess| OFR
    OFR -->|6. MarkState| MR
    MR -->|7. ExecutionStateChanged| OFR
    OFR -->|8. excesses| C
```

```mermaid
sequenceDiagram
    participant R as Router
    participant OR as OffRamp
    participant RE as ReceiveExecutor{id}
    participant MR as MerkleRoot{id}
    participant C as Caller


    activate R
    Note over R: RECEIVES CCIPReceiveConfirm<br>{ execID }
    R ->> OR: CCIPReceiveConfirm { execID, receiver }
    deactivate R



    activate OR
    Note over OR: Verifies sender is Router
    OR ->> RE: CCIPReceiveConfirm { receiver }
    deactivate OR


    activate RE
    Note over RE: Verifies sender is OffRamp
    Note over RE: Verifies receiver is the message's receiver
    Note over RE: Set state: Success
    RE ->> OR: NotifySuccess { header, execID, root, excesses }
    deactivate RE



    activate OR
    Note over OR: Verifies sender is ReceiveExecutor
    Note over OR: On a retry, keeps the executor's init value<br>(funded by the first caller)
    OR ->> MR: MarkState { seqNum, state: Success, excessesTo, header }
    deactivate OR


    activate MR
    Note over MR: Verifies sender is OffRamp
    Note over MR: Sets state: Success
    MR ->> OR: ExecutionStateChanged { header, state: Success, excessesTo }
    alt Last message of the root
    Note over MR: Returns its balance to the OffRamp and freezes
    end
    deactivate MR


    activate OR
    Note over OR: Verifies sender is MerkleRoot
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: Success }
    OR ->> C: excesses
    deactivate OR
```

### Failure Path

```mermaid
graph LR
    RCV["Receiver"]
    R["Router"]
    OFR["OffRamp"]
    RE["ReceiveExecutor"]
    MR["MerkleRoot"]
    C["Caller"]

    R -->|1. Receiver_CCIPReceiveV2| RCV
    RCV -->|2. Bounced Receiver_CCIPReceiveV2| R
    R -->|3. CCIPReceiveBounced| OFR
    OFR -->|4. CCIPReceiveFailed| RE
    RE -->|5. NotifyFailure| OFR
    OFR -->|6. MarkState| MR
    MR -->|7. ExecutionStateChanged| OFR
    OFR -->|8. excesses| C
```

```mermaid
sequenceDiagram
    participant R as Router
    participant OR as OffRamp
    participant RE as ReceiveExecutor{id}
    participant MR as MerkleRoot{id}
    participant C as Caller


    activate R
    Note over R: RECEIVES Bounced<br>Receiver_CCIPReceiveV2 { execID }
    R ->> OR: CCIPReceiveBounced { execID, receiver }
    deactivate R



    activate OR
    Note over OR: Verifies sender is Router
    OR ->> RE: CCIPReceiveFailed { receiver }
    deactivate OR


    activate RE
    Note over RE: Verifies sender is OffRamp
    Note over RE: Verifies receiver is the message's receiver
    Note over RE: Set state: ExecuteFailed<br>(keeps its init value for retries)
    RE ->> OR: NotifyFailure { header, execID, root, excesses }
    deactivate RE



    activate OR
    Note over OR: Verifies sender is ReceiveExecutor
    OR ->> MR: MarkState { seqNum, state: Failure, excessesTo, header }
    deactivate OR


    activate MR
    Note over MR: Verifies sender is OffRamp
    Note over MR: Sets state: Failure
    MR ->> OR: ExecutionStateChanged { header, state: Failure, excessesTo }
    deactivate MR


    activate OR
    Note over OR: Verifies sender is MerkleRoot
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: Failure }
    OR ->> C: excesses
    deactivate OR
```

The failed message can then be retried with `ManuallyExecute`, which reuses the same
ReceiveExecutor.
