# Arbitrary Message Onramp Flow

> See [how CCIPSend works](send-executor.md) and [how the Token Registry is implemented](../../token-registry.md).

```mermaid
sequenceDiagram
    participant R as Router

    Note over R: Gets CCIPSend from User
    Note over R: Check enough TON for gas 
    alt Not enough TON for gas
    Note over R: Return TON
    else Enough TON

    R ->> OR: CCIPSend{}
    
    Note over OR: Create msgID
    create participant ORM
    OR ->> ORM: deploy CCIPSendStorage <br>initData{msgID}<br>store{msg: CCIPSend}

    box OnRamp
    participant OR as OnRamp
    participant ORM as SendExecutor<br>{id}
    end

    participant FQ as FeeQuoter

    ORM ->> FQ: getValidatedFee{msgID, CCIPSend}


    alt not enough to cover fee
    FQ ->> ORM: feeNotValidated{msgID, CCIPSend}
    Note over ORM: Reject CCIPSend

    else enough to cover for fee
    FQ ->> ORM: feeValidated{msgID, CCIPSend}
    Note over ORM: destroy
    destroy ORM
    ORM ->> OR: finishedSuccessfully{msgID, data:<br>CCIPSend} +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{CCIPSend}
    OR ->> R: messageSent{queryID, seqNum}<br>+ Recovered TON
    end
    end
```

For any bounce we catch, or when we say Reject CCIPSend, it envolves:

```mermaid
sequenceDiagram
    participant OR as OnRamp
    participant LRM as SendExecutor<br>{id}
    Note over LRM: destroy
    destroy LRM
    LRM ->> OR: messageRejected{queryID, messageId, msg, reason}<br>+ TON remaining balance
    Note over OR: Send CCIPSendACK{reason}<br>to the user + excess TON
```
