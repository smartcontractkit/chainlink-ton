# Token Transfer Onramp Flow

> Before you read, see [Jetton Transfer Notation Convention](../token-transfer-notation-convention.md)

> See also [how CCIPSend works](../../contracts/ccip/onramp-ccipsend-storage.md) and [how the Token Registry is implemented](../../contracts/ccip/token-registry.md).

## Any token transfer paid in TON or LINK transfer paid in LINK

```mermaid
sequenceDiagram
    participant R as Router

    Note over R: Gets transfer<br>of T from User<br>Transfer { amount,<br>fwdPayload: CCIPSend}
    Note over R: Check enough TON for gas 
    alt Not enough TON for gas
    Note over R: Refund Jettons
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

    box Token Registry<br>(not a contract but<br>a sharded collection)
    participant TRC as TR Cell (T Jetton)
    end

    participant TP as Token Pool T

    OR ->> FQ: getValidatedFee{msgID, CCIPSend}


    alt not enough to cover fee
    FQ ->> OR: feeNotValidated{msgID, CCIPSend}
    Note over OR: Reject CCIPSend

    else enough to cover for fee
    FQ ->> OR: feeValidated{msgID, CCIPSend}
    Note over OR: Calculate TR Cell based<br>on Token Address

    OR ->> TRC: GetTokenPoolInfo{msgID, CCIPSend}

    alt Token not supported (contract not deployed)
    TRC ->> OR: Bounced{truncatedGetTokenPoolInfo{msgID}}
    Note over OR: Reject CCIPSend
    else Supported Token
    TRC ->> OR: TokenPoolInfo{address}

    Note over OR: If paying with LINK,<br>keep some for fee

    OR -->> TP: Transfer T { amount,<br>fwdPayload: msgID }
    
    Note over TP: consume rate limit
    alt Rate limit error
    Note over OR: Reject CCIPSend

    else Consumes rate limit
    TP ->> OR: committedLockOrBurn{msgID} 
    OR ->> CS: consume{context: success} 
    Note over CS: destroy
    destroy CS
    CS ->> OR: consumed{msgID, data:<br>CCIPSend,context: success} +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{CCIPSend}
    OR ->> R: sendConfirmation{seqNum}<br>+ Recovered TON
    end
    end
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
    Note over OR: Send rejectedCCIPSend{reason}<br>to the user in a Jetton transfer<br>+ excess TON
```
