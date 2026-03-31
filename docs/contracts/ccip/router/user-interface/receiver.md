---
id: contracts-ccip-router-user-interface-receiver
slug: receiver
title: Receiver User Interface
sidebar_label: User Interface
sidebar_position: 5
---

# Receiver User Interface

For arbitrary messages, the receiver must handle incoming `CCIPReceive` messages. On receiving such a message, the receiver should:

- Verify received TON is enough to cover gas costs.
- Verify the sender is the Router contract to ensure authenticity.
- Enqueue a `CCIPReceiveConfirm` message back to the Router, confirming receipt of the message.
- Process the message data as required by the application logic.

## Happy Path

```mermaid
sequenceDiagram
    participant R as Router
    participant U as User

    activate R
    Note over R: RECEIVES CCIPReceive { execId,<br>message: { messageId,<br>sourceChain, sender, data }
    R ->> U: CCIPReceive { execId,<br>message: { messageId,<br>sourceChain, sender, data }
    deactivate R



    activate U
    Note over U: Verifies sender is Router
    U ->> R: CCIPReceiveConfirm<br>{ execId }
    Note over U: Process message data [...]
    deactivate U
```

## Failure Path

```mermaid
sequenceDiagram
    participant R as Router
    participant U as User

    activate R
    Note over R: RECEIVES CCIPReceive { execId,<br>message: { messageId,<br>sourceChain, sender, data }
    R ->> U: CCIPReceive { execId,<br>message: { messageId,<br>sourceChain, sender, data }
    deactivate R



    activate U
    Note over U: Verifies sender is Router
    U -x R: CCIPReceiveConfirm<br>{ execId }
    Note over U: Fails on processing message data [...]
    U ->> R: Bounced CCIPReceive { execId }
    deactivate U
```
