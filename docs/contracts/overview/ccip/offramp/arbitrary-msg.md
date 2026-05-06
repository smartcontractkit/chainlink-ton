---
id: contracts-ccip-offramp-arbitrary-msg
title: Arbitrary Message Offramp Flow
sidebar_label: Arbitrary Messages
sidebar_position: 1
---

# Arbitrary Message OffRamp Flow

> See [how CCIPSend works](receive-executor.md) and [how the Token Registry is implemented](../token-registry.md).

See also [MerkleRoot](./merkle-root.md) for the per-message execution state machine that drives retries and finalization.

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
    R -->|6. CCIPReceive| RCV
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
 
    Note over OR: RECEIVES Execute<br>{queryId, reportContext, report}
    activate OR
    Note over OR: Verifies sourceChain is enabled
    Note over OR: Calculates MerkleRootId<br>from MessageMetadataHash

    OR ->> MR: Validate { message, metadataHash }

    Note over OR: Verifies signatures and emits OCR3Base_Transmitted<br>{ocrPluginType, configDigest, sequenceNumber}
    deactivate OR

    activate MR

    Note over MR: Verifies sender is OffRamp
    Note over MR: Verifies message hasn't been executed yet
    Note over MR: Marks message as executed

    
    alt Not last message
    MR ->> OR: ExecuteValidated { message, root, metadataHash }
    else Last message: drains MerkleRoot
    deactivate MR
    destroy MR
    MR ->> OR: ExecuteValidated { message, root, metadataHash }
    end

    activate OR
    Note over OR: Verifies sender is MerkleRoot
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: InProgress }
    create participant RE as ReceiveExecutor{id}
    OR ->> RE: stateInit: Deployable {owner: OffRamp, id: truncated rootId}<br>Init: {owner: OffRamp, message,<br>execId: truncated rootId, state: Untouched}
    OR ->> RE: InitExecute {}
    deactivate OR



    activate RE
    Note over RE: Verifies sender is OffRamp
    RE ->> OR: DispatchValidated { message, execId }
    Note over RE: Set state: Execute
    deactivate RE



    activate OR
    Note over OR: Verifies sender is ReceiveExecutor
    Note over OR: Verifies gasLimit is above minimum
    alt Gas limit too low
    OR ->> RE: Bounced { receiver }
    Note over RE: [...]
    else

    OR ->> R: RouteMessage { dest: receiver,<br>message: CCIPReceive { execId,<br>message: { messageId,<br>sourceChain, sender, data }
    deactivate OR



    activate R
    Note over R: Verifies sender is OffRamp
    Note over R: SENDS message to Receiver
    deactivate R
    end
```

See [user interface](../router/user-interface/receiver.md) for more details on communication between User and Router.

## Receive Confirmation Flow

### Happy Path

```mermaid
graph LR
    RCV["Receiver"]
    R["Router"]
    OFR["OffRamp"]
    RE["ReceiveExecutor"]

    R -->|1. CCIPReceive| RCV
    RCV -->|2. CCIPReceiveConfirm| R
    R -->|3. CCIPReceiveConfirm| OFR
    OFR -->|4. Confirm| RE
    RE -->|5. NotifySuccess| OFR
```

```mermaid
sequenceDiagram
    participant R as Router
    participant OR as OffRamp
    participant RE as ReceiveExecutor{id}


    activate R
    Note over R: RECEIVES CCIPReceiveConfirm<br>{ execId }
    R ->> OR: CCIPReceiveConfirm { execId, receiver }
    deactivate R



    activate OR
    Note over OR: Verifies sender is Router
    OR ->> RE: Confirm { sender: Confirm.sender }
    deactivate OR


    activate RE
    Note over RE: Verifies sender is OffRamp
    Note over RE: Verifies Confirm.sender is Receiver
    Note over RE: Set state: Success
    deactivate RE
    destroy RE
    RE ->> OR: NotifySuccess { header, execId }



    activate OR
    Note over OR: Verifies sender is ReceiveExecutor
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: Success }
    deactivate OR
```

### Failure Path

```mermaid
graph LR
    RCV["Receiver"]
    R["Router"]
    OFR["OffRamp"]
    RE["ReceiveExecutor"]

    R -->|1. CCIPReceive| RCV
    RCV -->|2. Bounced CCIPReceive| R
    R -->|3. CCIPReceiveBounced| OFR
    OFR -->|4. Bounced| RE
    RE -->|5. NotifyFailure| OFR
```

```mermaid
sequenceDiagram
    participant R as Router
    participant OR as OffRamp
    participant RE as ReceiveExecutor{id}


    activate R
    Note over R: RECEIVES Bounced<br>CCIPReceive { execId }
    R ->> OR: CCIPReceiveBounced { sender }
    deactivate R



    activate OR
    Note over OR: Verifies sender is Router
    OR ->> RE: Bounced { sender: Bounced.sender }
    deactivate OR


    activate RE
    Note over RE: Verifies sender is OffRamp
    Note over RE: Verifies Confirm.sender is Receiver
    Note over RE: Set state: ExecuteFailed
    deactivate RE
    RE ->> OR: NotifyFailure { header, execId }



    activate OR
    Note over OR: Verifies sender is ReceiveExecutor
    Note over OR: emits: ExecutionStateChanged { sourceChainSelector,<br>sequenceNumber, messageId, state: Failure }
    deactivate OR
```
