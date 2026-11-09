---
id: contracts-ccip-router-user-interface-receiver
slug: receiver
title: Receiver User Interface
sidebar_label: Receiver
sidebar_position: 3
---

# Receiver User Interface

For arbitrary messages, the receiver must handle incoming `Receiver_CCIPReceiveV2` messages. On receiving such a message, the receiver should:

- Verify received TON is enough to cover gas costs.
- Verify the sender is the Router contract to ensure authenticity.
- Enqueue a `CCIPReceiveConfirm` message back to the Router, confirming receipt of the message.
- Process the message data as required by the application logic.

`receiverAccounts` lists the Router-owned receiver accounts (deposit accounts) the message's tokens were delivered to, index-aligned with `message.tokenAmounts`. It is empty when the message carries no tokens. The receiver withdraws the tokens from those accounts (see [Receiver Account Address](#receiver-account-address)).

## Happy Path

```mermaid
sequenceDiagram
    participant R as Router
    participant U as User

    activate R
    Note over R: RECEIVES Receiver_CCIPReceiveV2 { execID,<br>message: { messageId,<br>sourceChain, sender, data, tokenAmounts },<br>receiverAccounts }
    R ->> U: Receiver_CCIPReceiveV2 { execID,<br>message: { messageId,<br>sourceChain, sender, data, tokenAmounts },<br>receiverAccounts }
    deactivate R



    activate U
    Note over U: Verifies sender is Router
    U ->> R: CCIPReceiveConfirm<br>{ execID }
    Note over U: Process message data [...]
    deactivate U
```

## Failure Path

```mermaid
sequenceDiagram
    participant R as Router
    participant U as User

    activate R
    Note over R: RECEIVES Receiver_CCIPReceiveV2 { execID,<br>message: { messageId,<br>sourceChain, sender, data, tokenAmounts },<br>receiverAccounts }
    R ->> U: Receiver_CCIPReceiveV2 { execID,<br>message: { messageId,<br>sourceChain, sender, data, tokenAmounts },<br>receiverAccounts }
    deactivate R



    activate U
    Note over U: Verifies sender is Router
    U -x R: CCIPReceiveConfirm<br>{ execID }
    Note over U: Fails on processing message data [...]
    U ->> R: Bounced Receiver_CCIPReceiveV2 { execID }
    deactivate U
```

## Messages Stuck In-Progress  

Messages can get stuck in an "In Progress" state for two reasons:

- Successful delivery but no confirmation: The receiver got the message and processed it successfully but failed to send the `CCIPReceiveConfirm` back to the Router, leaving the message in an "In Progress" state until the Router times out the message. This is bad practice and can lead to confused users using ccip explorer.
- Fail to deliver message and no bounce: If the gas limit is too low, the message may not be delivered to the receiver, or the receiver might ran ouf of gas during validation, and there will be no gas left to send the bounce message back to the Router, leaving the message in an "In Progress". In this situation, the message will never be enabled for manual execution and will be stuck forever. To avoid this, the sender should use a gas limit that is high enough to cover the worst case scenario.

## Receiver Account Address

Tokens sent to a receiver are delivered to its Router-owned receiver account (a deposit account keyed by `(receiver, token)`), from which the receiver withdraws them. Off-chain, the address is available through the Router's `receiverAccountAddress(receiver, token)` getter. On-chain, a contract can ask the Router for its own receiver account address. Nothing is deployed, and the Router replies with the remaining message value:

```mermaid
sequenceDiagram
    participant U as Receiver
    participant R as Router

    U ->> R: Router_GetReceiverAccountAddress { queryId, token, context? }
    R ->> U: Router_ReceiverAccountAddress { queryId, account, token, context }
```

`queryId` and `context` are echoed back unchanged.
