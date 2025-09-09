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

    Note over OR: Create msgID
    create participant CS as CCIPSendStorage
    OR ->> CS: deployCCIPSendStorage{<br>initData{msgID},<br>initCCIPSend{msg: ccipSend}}
    CS ->> OR: deployed{msgID, ccipSend}

    box OnRamp
    participant ORJW as OnRamp's <br>Jetton A Wallet
    participant OR as OnRamp
    participant CS as CCIPSendStorage
    end

    participant FQ as FeeQuoter

    box Token Registry<br>(not a contract but<br>a sharded collection)
    participant TRC as TR Cell (Jetton A)
    end

    box Token Pools
    participant TP as Token Pool A
    participant TPJW as TokenPool's <br>Jetton A Wallet
    end

    OR ->> FQ: getValidatedFee{msgID, ccipSend}


    alt not enough to cover fee
    FQ ->> OR: feeNotValidated{msgID, ccipSend}
    Note over OR: Refund Jettons [...]

    else enough to cover for fee
    FQ ->> OR: feeValidated{msgID, ccipSend}
    Note over OR: Calculate TR Cell based<br>on Token Address

    OR ->> TRC: GetTokenPoolInfo{msgID, ccipSend}

    alt Token not supported (contract not deployed)
    TRC ->> OR: Bounced{truncatedGetTokenPoolInfo{msgID}}
    OR ->> CS: getInfo{msgID}
    CS ->> OR: refund{ccipSend}
    Note over OR: Refund Jettons
    else Supported Token
    TRC ->> OR: TokenPoolInfo{address}

    OR ->> ORJW: TransferRequest { amount,<br>destination: TokenPoolA,<br>fwdPayload: msgID }
    
    ORJW ->> TPJW: Transfer { amount,<br>fwdPayload: msgID }
    TPJW ->> TP: TransferNotification {<br>sender, amount,<br>fwdPayload: msgID }
    Note over TP: consume rate limit
    alt Rate limit error
    Note over TP, TPJW: Refund Jettons [...]

    else Consumes rate limit
    TP ->> OR: committedLockOrBurn{msgID} 
    OR ->> CS: consumeCcipSend 
    Note over CS: destroy
    destroy CS
    CS ->> OR: commit(ccipSend) +<br>TON remaining balance
    note over OR: assign seqNum
    note over OR: emit{ccipSend}
    end
    end
    end
    end
```