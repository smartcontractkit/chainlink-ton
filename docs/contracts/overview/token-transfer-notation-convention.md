---
id: contracts-overview-token-transfer-notation-convention
slug: /contracts/overview/token-transfer-notation-convention
title: Token Transfer Notation Convention
sidebar_label: Token Transfer Notation Convention
sidebar_position: 7
---

# Token Transfer Notation Convention

This is a convention we will be using for our diagrams. Given to actors **A** and **B** where **A** transfer `T` Jettons to **B**, the real message flow looks like this:

```mermaid
sequenceDiagram

participant A
participant AW as A's T Jetton Wallet
participant BW as B's T Jetton Wallet
participant B

A ->> AW: TransferRequest {<br>amount,<br>destination: B,<br>fwdPayload }

AW ->> BW: Transfer { amount,<br>fwdPayload }
BW ->> B: TransferNotification {<br>sender, amount,<br>fwdPayload}
```

To reduce noice, we will represent this flow with a doted line arrow

```mermaid
sequenceDiagram

participant A
participant B

A -->> B: Transfer T { amount,<br>fwdPayload }
```

We must remember that we cannot get bounced from this transfers, and that they envolve 3 hops, so they add latency and foward fee costs.
