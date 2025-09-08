# CCIP Flow

## Token Transfer

### Token Transfer OnRamp Flow

```mermaid
---
config:
  sequence:
    
---
sequenceDiagram
    box User 
    participant U as User
    participant UJW as User's <br>Jetton A Wallet
    end

    box Router
    participant RJW as Router's <br>Jetton A Wallet
    participant R as Router
    end

    U ->> UJW: TransferRequest {<br>amount,<br>destination: Router,<br>fwdPayload: ccipSend }
    
    UJW ->> RJW: Transfer { amount,<br>fwdPayload: ccipSend }
    RJW ->> R: TransferNotification {<br>sender, amount,<br>fwdPayload: ccipSend}
    Note over R: Check enough TON for gas 
    alt Not enough TON for gas
    Note over R: Refund Jettons
    else Enough TON

    R ->> RJW: TransferRequest {<br>amount,<br>destination: Router,<br>fwdPayload: ccipSend }
    
    RJW ->> ORJW: Transfer { amount,<br>fwdPayload: ccipSend }
    ORJW ->> OR: TransferNotification {<br>sender, amount,<br>fwdPayload: ccipSend}
    Note over OR: Assign msgId<br>Store ccipSend by msgId

    box OnRamp
    participant ORJW as OnRamp's <br>Jetton A Wallet
    participant OR as OnRamp
    end

    participant FQ as FeeQuoter

    box Token Registry<br>(not a contract but<br>a sharded collection)
    participant TRC as TR Cell (Jetton A)
    end

    box Token Pools
    participant TP as Token Pool A
    participant TPJW as TokenPool's <br>Jetton A Wallet
    end

    OR ->> FQ: getValidatedFee{msgId, ccipSend}


    alt not enough to cover fee
    FQ ->> OR: feeNotValidated{msgId, ccipSend}
    Note over OR: Refund Jettons [...]

    else enough to cover for fee
    FQ ->> OR: feeValidated{msgId, ccipSend}
    Note over OR: Calculate TR Cell based<br>on Token Addres

    OR ->> TRC: GetTokenPoolInfo{msgId, ccipSend}

    alt Token not supported (contract not deployed)
    TRC ->> OR: Bounced{GetTokenPoolInfo{msgId, ccipSend}}
    Note over OR: get ccipSend from msgId<br>Refund Jettons [...]
    else Supported Token

    OR ->> ORJW: TransferRequest { amount,<br>destination: TokenPoolA,<br>fwdPayload: {msgId,ccipSend} }
    
    ORJW ->> TPJW: Transfer { amount,<br>fwdPayload: ccipSend }
    TPJW ->> TP: TransferNotification {<br>sender, amount,<br>fwdPayload: ccipSend }
    Note over TP: consume rate limit
    alt Rate limit error
    Note over TP: Refund Jettons [...]

    else Consumes rate limit
    TP ->> OR: commitedLockOrBurn{ccipSend}
    note over OR: assign seqNum
    note over OR: emit{ccipSend}
    note over OR: remove ccipSend<br>from storage
    end
    end
    end
    end
```