---
id: contracts-ccip-onramp-arbitrary-msg
title: Arbitrary Message Onramp Flow
sidebar_label: Arbitrary Messages
sidebar_position: 2
---

# Arbitrary Message Onramp Flow

> See [how CCIPSend works](send-executor.md) and [how the Token Registry is implemented](../token-registry.md).


```mermaid
graph LR
    TX["Sender"]
    R["Router"]
    OR["OnRamp"]
    SE["SendExecutor"]
    FQ["FeeQuoter"]

    TX -->|1. Router_CCIPSend| R
    R -->|2. Send| OR
    OR -->|3. Initialize & Execute| SE
    SE -->|4. GetValidatedFee| FQ
    FQ -->|5. MessageValidated| SE
    SE -->|6. ExecutorFinishedSuccessfully| OR
    OR -->|7. MessageSent| R
```

```mermaid
sequenceDiagram
    participant R as Router

    Note over R: Gets CCIPSend from User
    Note over R: Check enough TON for gas 
    alt Not enough TON for gas
    Note over R: Return TON
    else Enough TON

    R ->> OR: Send { msg: CCIPSend, metadata }
    
    Note over OR: Create msgID
    create participant ORM
    OR ->> ORM: InitializeAndSend { <br/>stateInit: executorID <br/> selfMessage: Execute{msg} }<br>store{msg}

    box OnRamp
    participant OR as OnRamp
    participant ORM as SendExecutor<br>{id}
    end

    participant FQ as FeeQuoter

    ORM ->> FQ: GetValidatedFee { msg }


    alt not enough to cover fee
    FQ ->> ORM: MessageValidationFailed{error, msg}
    Note over ORM: Reject CCIPSend [...]

    else enough to cover for fee
    FQ ->> ORM: MessageValidated
    Note over ORM: destroy
    destroy ORM
    ORM ->> OR: ExecutorFinishedSuccessfully{msgID, data:<br>CCIPSend} +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{CCIPSend}
    OR ->> R: MessageSent{queryID, seqNum}<br>+ TON remaining from <br/> gas fees and CCIP fee
    end
    end
```

For rejected sends or executor failures, the main notification path is:

```mermaid
sequenceDiagram
    participant TX as Sender
    participant R as Router
    participant OR as OnRamp
    participant LRM as SendExecutor<br>{id}
    Note over LRM: destroy
    destroy LRM
    LRM ->> OR: ExecutorFinishedWithError
    OR ->> R: MessageRejected
    R ->> TX: CCIPSendNACK<br/> + TON Remaining from gas fees
```
