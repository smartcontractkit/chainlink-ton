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
    participant R as Router
    participant RJW as Router's <br>Jetton A Wallet
    end

    participant OR as OnRamp

    participant FQ as FeeQuoter

    box Token Registry<br>(not a contract but<br>a collection)
    participant TRC as TR Cell (Jetton A)
    end

    box Token Pools
    participant TP as Token Pool A
    participant TPJW as TokenPool's <br>Jetton A Wallet
    end

    U ->> UJW: TransferRequest {<br>amount,<br>destination: Router,<br>fwdPayload: ccipSend }
    
    UJW ->> RJW: Transfer { amount,<br>fwdPayload: ccipSend }
    RJW ->> R: TransferNotification {<br>sender, amount,<br>fwdPayload: ccipSend}
    Note over R: Check enough TON for gas 
    R ->> OR: ccipSend

    OR ->> FQ: getValidatedFee{ccipSend}


    alt not enough to cover fee
    FQ ->> OR: feeNotValidated{ccipSend}
    Note over OR: Refund Jettons [...]

    else enough to cover for fee
    FQ ->> OR: feeValidated{ccipSend}
    Note over OR: Calculate TR Cell based<br>on Token Addres

    OR ->> TRC: GetTokenPoolInfo{ccipSend}

    alt Token not supported (contract not deployed)
    TRC ->> OR: Bounced{GetTokenPoolInfo{ccipSend}}
    Note over OR: TODO where do we store the<br>relevant info to refund the sender?
    else Supported Token

    TRC ->> OR: TokenPoolInfo{tokenPoolAddress, ccipSend}

    OR ->> R: lockTokens{tokenPoolAddr, ccipSend}
 
    R ->> RJW: TransferRequest { amount,<br>destination: TokenPoolA,<br>fwdPayload: ccipSend }
    
    RJW ->> TPJW: Transfer { amount,<br>fwdPayload: ccipSend }
    TPJW ->> TP: TransferNotification {<br>sender, amount,<br>fwdPayload: ccipSend }
    Note over TP: consume rate limit
    alt Rate limit error
    Note over TP: Refund Jettons [...]

    else Consumes rate limit
    TP ->> OR: commitedLockOrBurn{ccipSend}
    OR ->> OR: send{ccipSend}
    note over OR  : ...
    end
    end
    end
```