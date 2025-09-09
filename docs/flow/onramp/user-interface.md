# OnRamp User Interface

For arbitrary messages paying fees in TON, the user interface is as follows:

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router

    Note over U: TODO Get fee?

    U ->> R: CCIPSend{}
    
    Note over R: [...]
    alt Reject (Refund tokens)
    Note over R: Low fee/Rate limit/other
    R ->> U: rejectedCCIPSend{reason}
  
    else Accept msg
    Note over R: emit{CCIPSend}
    R ->> U: ccipSent{seqNum}
    end
```

For token transfers paid in TON, the user interface is as follows:

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router

    Note over U: TODO Get fee?

    U -->> R: Transfer T { amount,<br>fwdPayload: CCIPSend }
    
    Note over R: [...]
    alt Reject (Refund tokens)
    Note over R: Low fee/Rate limit/other
    R -->> U: Transfer T { amount,<br>fwdPayload: rejectedCCIPSend{reason} }
  
    else Accept msg
    Note over R: emit{CCIPSend}
    R ->> U: ccipSent{seqNum}
    end
```

TODO: both paid with Link
