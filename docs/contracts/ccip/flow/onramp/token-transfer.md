# Token Transfer Onramp Flow

> Before you read, see [Jetton Transfer Notation Convention](../token-transfer-notation-convention.md)

> See also [how CCIPSend works](../../onramp-ccipsend-executor.md) and [how the Token Registry is implemented](../../token-registry.md).

_The message flow for **Reject CCIPSend** is collapsed to a Note. You can find more details below._

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
    create participant ORM
    OR ->> ORM: deploy SendExecutor <br>initData{msgID}<br>execute{CCIPSend, onrampJettonWallet}
    ORM ->> OR: withdrawJettons{ORM.id, ccipSend}
    OR -->> ORM: Transfer T { amount,<br>fwdPayload: msgID }

    box OnRamp
    participant OR as OnRamp
    participant ORM as SendExecutor<br>{id}
    end

    participant FQ as FeeQuoter

    box Token Registry<br>(not a contract but<br>a sharded collection)
    participant TRC as TR Cell (T Jetton)
    end

    participant TP as Token Pool T

    ORM ->> FQ: getValidatedFee{msgID, CCIPSend}


    alt not enough to cover fee
    FQ ->> ORM: feeNotValidated{msgID, CCIPSend}
    Note over ORM: Reject CCIPSend *

    else enough to cover for fee
    FQ ->> ORM: feeValidated{msgID, CCIPSend}
    Note over ORM: Calculate TR Cell based<br>on Token Address

    ORM ->> TRC: GetTokenPoolInfo{msgID, CCIPSend}

    alt Token not supported (contract not deployed)
    TRC ->> ORM: Bounced{truncatedGetTokenPoolInfo{msgID}}
    Note over ORM: Reject CCIPSend *
    else Supported Token
    TRC ->> ORM: TokenPoolInfo{address}

    ORM -->> TP: Transfer T { amount, fwdPayload: msgID }
    
    Note over TP: consume rate limit
    alt Rate limit error
    TP -->> ORM: Transfer T { amount, fwdPayload: rateLimitExceeded{msgID} }
    Note over ORM: Reject CCIPSend *

    else Consumes rate limit
    TP ->> ORM: committedLockOrBurn{msgID} 
    Note over ORM: destroy
    destroy ORM
    ORM ->> OR: finishedSuccessfully{msgID, data:<br>CCIPSend} +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{CCIPSend}
    OR ->> R: sendConfirmation{seqNum}<br>+ Recovered TON
    end
    end
    end
    end
```

For any bounce we catch, or every **Reject CCIPSend**, it envolves:

```mermaid
sequenceDiagram
    participant OR as OnRamp
    participant LRM as SendExecutor<br>{id}
    Note over LRM: destroy
    destroy LRM
    LRM -->> OR: Transfer T {fwdPayload: failed{storageID: LRM.id, data:<br>CCIPSend, reason}}<br>+ TON remaining balance
    Note over OR: Send rejectedCCIPSend{reason}<br>to the user in a Jetton transfer<br>+ excess TON
```
