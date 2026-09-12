# Arbitrary Message Onramp Flow

> See [how CCIPSend works](../../contracts/ccip/onramp-ccipsend-storage.md) and [how the Token Registry is implemented](../../contracts/ccip/token-registry.md).

## Paid with TON

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
    create participant CS
    OR ->> CS: deploy CCIPSendStorage <br>initData{msgID}<br>store{msg: CCIPSend}
    CS ->> OR: stored{msgID, CCIPSend}

    box OnRamp
    participant OR as OnRamp
    participant CS as CCIPSendStorage<br>{id}
    end

    participant FQ as FeeQuoter

    OR ->> FQ: getValidatedFee{msgID, CCIPSend}


    alt not enough to cover fee
    FQ ->> OR: feeNotValidated{msgID, CCIPSend}
    Note over OR: Reject CCIPSend

    else enough to cover for fee
    FQ ->> OR: feeValidated{msgID, CCIPSend}
    OR ->> CS: consume{context: success} 
    Note over CS: destroy
    destroy CS
    CS ->> OR: consumed{msgID, data:<br>CCIPSend,context: success} +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{CCIPSend}
    OR ->> R: sendConfirmation{seqNum}<br>+ Recovered TON
    end
    end
```

For any bounce we catch, or when we say Reject CCIPSend, it envolves:

```mermaid
sequenceDiagram
    participant OR as OnRamp
    participant CS as CCIPSendStorage
    OR ->> CS: consume{context: failedValidation} 
    Note over CS: destroy
    destroy CS
    CS ->> OR: consumed{storageID: CS.id, data:<br>CCIPSend, context: failedValidation}<br>+ TON remaining balance
    Note over OR: Send rejectedCCIPSend{reason}<br>to the user + excess TON
```

## Paid with LINK

```mermaid
sequenceDiagram
    participant R as Router

    Note over R: Gets CCIPSend from User
    Note over R: Check enough TON for gas 
    alt Not enough TON for gas
    Note over R: Return TON
    else Enough TON

    R -->> OR: Transfer T { amount,<br>fwdPayload: CCIPSend }
    
    Note over OR: Create msgID
    create participant CS
    OR ->> CS: deploy CCIPSendStorage <br>initData{msgID}<br>store{msg: CCIPSend}
    CS ->> OR: stored{msgID, CCIPSend}

    box OnRamp
    participant OR as OnRamp
    participant CS as CCIPSendStorage<br>{id}
    end

    participant FQ as FeeQuoter

    OR ->> FQ: getValidatedFee{msgID, CCIPSend}


    alt not enough to cover fee
    FQ ->> OR: feeNotValidated{msgID, CCIPSend}
    Note over OR: Reject CCIPSend

    else enough to cover for fee
    FQ ->> OR: feeValidated{msgID, CCIPSend}
    OR ->> CS: consume{context: success} 
    Note over CS: destroy
    destroy CS
    CS ->> OR: consumed{msgID, data:<br>CCIPSend,context: success} +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{CCIPSend}
    OR ->> R: sendConfirmation{seqNum}<br>+ Recovered TON
    end
    end
```

For any bounce we catch, or when we say Reject CCIPSend, it envolves:

```mermaid
sequenceDiagram
    participant OR as OnRamp
    participant CS as CCIPSendStorage
    OR ->> CS: consume{context: failedValidation} 
    Note over CS: destroy
    destroy CS
    CS ->> OR: consumed{storageID: CS.id, data:<br>CCIPSend, context: failedValidation}<br>+ TON remaining balance
    Note over OR: Send rejectedCCIPSend{reason}<br>to the user + excess TON
```
