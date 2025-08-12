# Jettons - TON Tokens

Jettons is the TON standard for Fungible Tokens.

## Basic workflow

![Flow diagram](./simple-transfer.png)

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
    BOB->>+JW_BOB: transfer(<br/>query_id,<br/>amount,<br/>destination,<br/>response_destination,<br/>custom_payload,<br/>forward_ton_amount,<br/>forward_payload<br/>)
    Note over JW_BOB, JW_ALICE: Message 1<br/>Internal transfer
    JW_BOB->>+JW_ALICE: internal transfer
    deactivate JW_BOB
    Note over JW_ALICE: Message 2<br/>Jetton Balance Update
    JW_ALICE->>JW_ALICE: update balance
    alt forward_ton_amount > 0
        Note over JW_ALICE, ALICE: Message 2'<br/>Transfer Notification
        JW_ALICE->>ALICE: transfer_notification(<br/>query_id,<br/>amount,<br/>sender,<br/>forward_payload<br/>)
    end
    alt excess Toncoin exists
        Note over JW_ALICE, JOE: Message 2''<br/>Excesses
        JW_ALICE->>JOE: excesses(<br/>query_id<br/>)
        deactivate JW_ALICE
    end
```

## Usage

The [func implementation of Jettons](https://github.com/ton-blockchain/jetton-contract/tree/3d24b419f2ce49c09abf6b8703998187fe358ec9/contracts) is made available throguh nix.
The minter and wallet contracts can be built by running

```bash
nix build .#contracts-jetton-func
```

appending `--print-out-paths` at the end displays the directory where they can be located.

```bash
$ nix build .#contracts-jetton-func --print-out-paths
/nix/store/s3rsxlqskan6ripf2sii9njrzv1mhbxz-contracts-jetton-func-1.2.0
```

Furthermore, the `#contracts` nix shell compiles and exposes the build directory through the environment variable `PATH_CONTRACTS_JETTON`.

```bash
$ nix develop .#contracts -c ls -lca $PATH_CONTRACTS_JETTON
Jetton contracts located here: /nix/store/s3rsxlqskan6ripf2sii9njrzv1mhbxz-contracts-jetton-func-1.2.0/lib/node_modules/jetton/build/
total 16
dr-xr-xr-x  6 root wheel  192 Jul  8 14:47 .
dr-xr-xr-x 15 root wheel  480 Jul  8 14:47 ..
-r--r--r--  1 root wheel 2386 Jul  8 14:47 JettonMinter.compiled.json
-r--r--r--  1 root wheel 1834 Jul  8 14:47 JettonWallet.compiled.json
```

## Docs

<https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md>
<https://docs.ton.org/v3/guidelines/dapps/asset-processing/jetton/#jetton-master-smart-contract>
<https://docs.ton.org/img/docs/asset-processing/jetton_transfer.png?raw=true>
