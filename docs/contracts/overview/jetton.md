# Jettons - TON Tokens

https://docs.ton.org/v3/guidelines/dapps/asset-processing/jetton/#jetton-master-smart-contract

https://docs.ton.org/img/docs/asset-processing/jetton_transfer.png?raw=true 

```mermaid
---
config:
  sequence:
    messageAlign: left
---
sequenceDiagram
    participant BOB as BOB<br/>Wallet v3
    participant JW_BOB as Jetton Wallet (BOB)
    participant JW_ALICE as Jetton Wallet (ALICE)
    participant ALICE as ALICE<br/>Wallet v4
    participant JOE as JOE<br/>Response Destination
    Note over BOB, JW_BOB: Message 0<br/>Transfer
    BOB->>JW_BOB: transfer(<br/>query_id,<br/>amount,<br/>destination,<br/>response_destination,<br/>custom_payload,<br/>forward_ton_amount,<br/>forward_payload<br/>)
    Note over JW_BOB, JW_ALICE: Message 1<br/>Internal transfer
    JW_BOB->>JW_ALICE: internal transfer
    Note over JW_ALICE: Message 2<br/>Jetton Balance Update
    JW_ALICE->>JW_ALICE: update balance
    alt forward_ton_amount > 0
        Note over JW_ALICE, ALICE: Message 2'<br/>Transfer Notification
        JW_ALICE-->>ALICE: transfer_notification(<br/>query_id,<br/>amount,<br/>sender,<br/>forward_payload<br/>)
    end
    alt excess Toncoin exists
        Note over JW_ALICE, JOE: Message 2''<br/>Excesses
        JW_ALICE-->>JOE: excesses(<br/>query_id<br/>)
    end
```