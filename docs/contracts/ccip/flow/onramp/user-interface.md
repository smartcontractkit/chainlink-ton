# Sender User Interface

For arbitrary messages paying fees in TON, the user interface is as follows:

```mermaid
sequenceDiagram
    participant U as Sender
    participant R as Router

    Note over U: TODO Get fee?

    U ->> R: CCIPSend{queryID, msg}
    
    Note over R: [...]
    alt Reject (Refund tokens)
    Note over R: Low fee/Rate limit/other
    R ->> U: CCIPSendNACK{queryID, reason}
  
    else Accept msg
    Note over R: emit{CCIPSend}
    R ->> U: CCIPSendACK{queryID, seqNum}
    end
```

For token transfers paid in TON, the user interface is as follows:

```mermaid
sequenceDiagram
    participant U as Sender
    participant R as Router

    Note over U: TODO Get fee?

    U -->> R: Transfer T { amount,<br>fwdPayload: CCIPSend }
    
    Note over R: [...]
    alt Reject (Refund tokens)
    Note over R: Low fee/Rate limit/other
    R -->> U: Transfer T { amount,<br>fwdPayload: CCIPSendNACK{queryID, reason} }
  
    else Accept msg
    Note over R: emit{CCIPSend}
    R ->> U: CCIPSendACK{queryID, seqNum}
    end
```

TODO: both paid with Link
