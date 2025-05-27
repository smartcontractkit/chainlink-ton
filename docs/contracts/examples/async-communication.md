# Async Communication Examples

This document describes some examples developed to illustrate async communication

## Directory structure

- Contracts: `/contracts/contracts/examples/async-communication/<experiment_name>`
- Wrappers: `/contracts/wrappers/examples/async-communication/<experiment_name>`
- Tests: `/contracts/tests/async-communication/<experiment_name>_test.go`

## Running tests

To compile contracts, on repo root dir run:

```bash
yarn dev:build
```

Then you can run tests from contracts/tests.

To run a specific test, you might run `go test -v -run ^TestExampleName$ github.com/smartcontractkit/chainlink-ton/contracts/tests/`.

## Diagram Convention

Diagrams where made following [Mermaid](https://mermaid-js.github.io/mermaid/#/) syntax. If you are using VSCode, I suggest installing [Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items/?itemName=bierner.markdown-mermaid) extension.

In the following diagrams, I am using dashed-line arrows --> to denote external messages, solid-line arrows for internal messages, actor for rpc clients and blocks for smart contracts.

```mermaid
sequenceDiagram
    actor RPCClient
    RPCClient-->>ContractA:externalMsgIn
    ContractA-->>RPCClient:externalMsgOut
    ContractA->>ContractB:internalMsg
```

## Deposit

Simple deposit from one wallet to another

```mermaid
sequenceDiagram
    actor Alice
    Alice-->>+AliceWallet:send(BobWalletAddr, transfer(1 Ton))
    AliceWallet->>-BobWallet:1 Ton
    actor Bob
    Bob-->>+BobWallet: getBalance
    BobWallet-->>-Bob: balance
```

## Test possible replay attack

An article described a possible attack vector consisting on replaying failed transactions. It suggested that the seqno of a wallet was not incremented when processing a transfer with an amount higher than the balance. This was proven to be false.

## Two msg chain

```mermaid
sequenceDiagram
    actor Alice
    Alice-->>+AliceWallet: send(storeAddr, store(value))
    AliceWallet->>+Storage: store(value)
    deactivate AliceWallet
    Storage->>+Memory: store(value)
    deactivate Storage
    Memory->>-Memory: store value
    Alice-->>+Memory: getValue()
    Memory-->>-Alice: stored value
```

## Request-reply

```mermaid
sequenceDiagram
    actor Alice
    Alice-->>+AliceWallet: send(StorageAddr, getPriceFrom(queryID, PriceRegistry, apple))
    AliceWallet->+Storage: getPriceFrom(queryID, PriceRegistry, apple)
    deactivate AliceWallet
    Storage->>Storage: store request
    Storage->>+PriceRegistry: getPrice(queryID, apple)
    deactivate Storage
    PriceRegistry->>+ApplePrice: getPrice(queryID)
    deactivate PriceRegistry
    ApplePrice->>+PriceRegistry: requestedPrice(queryID, price)
    deactivate ApplePrice
    PriceRegistry->>+Storage: storeValue(queryID, price)
    deactivate PriceRegistry
    Storage->>Storage: store value
    deactivate Storage
    Alice-->>+Storage: getStoredValue(queryID)
    Storage-->>-Alice: stored price
```

## Request-reply with two dependencies

```mermaid
sequenceDiagram
    actor Alice
    Alice-->>+AliceWallet: send(StorageAddr, getCapital(queryID, Inventory, apple))
    AliceWallet->+Storage: getCapital(queryID, Inventory, apple)
    deactivate AliceWallet
    Storage->>Storage: store request
    Storage->>+Inventory: getCapital(queryID, apple)
    deactivate Storage
    Inventory->>Inventory: storePending(queryID)
    Inventory->>+ApplePrice: getPrice(queryID)
    Inventory->>+AppleInventory: getCount(queryID)
    deactivate Inventory
    ApplePrice->>+Inventory: requestedPrice(queryID, price)
    deactivate ApplePrice
    Inventory->>-Inventory: storePrice(queryID)
    AppleInventory->>+Inventory: requestedCount(queryID)
    deactivate AppleInventory
    Inventory->>+Storage: storeValue(queryID, count * price)
    deactivate Inventory
    Storage->>Storage: store value
    deactivate Storage
    Alice-->>+Storage: getStoredValue(queryID)
    Storage-->>-Alice: stored price
```

This experiment has events all over the play to make it easier to track the flow.

## Two-phase Commit

```mermaid
sequenceDiagram
    actor Alice
    Alice-->>+AliceWallet: send(DBAddr, beginTransaction(queryID))
    AliceWallet->>+DB: beginTransaction(queryID)
    deactivate AliceWallet
    Alice-->>+AliceWallet: send(DBAddr, setValue(queryID, CounterAAddr, 1))
    AliceWallet->>+DB: setValue(queryID, CounterAAddr, 1)
    deactivate AliceWallet
    DB->>DB: addPendingAck(queryID, counterA)
    DB->>+CounterA: prepareSetValue(1)
    deactivate DB
    Alice-->>+AliceWallet: send(DBAddr, setValue(queryID, CounterBAddr, 1))
    AliceWallet->>+DB: setValue(queryID, CounterBAddr, 2)
    deactivate AliceWallet
    DB->>DB: addPendingAck(queryID, counterB)
    DB->>+CounterB: prepareSetValue(2)
    deactivate DB
    Alice-->>+AliceWallet: send(DBAddr, commit(queryID))
    AliceWallet->>+DB: commit(queryID)
    deactivate AliceWallet
    DB->>DB: await for acks
    deactivate DB
    CounterA->>+DB: ack(queryID)
    deactivate CounterA
    DB->>DB: rmPendingAck(queryID, counterA)
    deactivate DB
    CounterB->>+DB: ack(queryID)
    deactivate CounterB
    DB->>DB: rmPendingAck(queryID, counterB)
    DB->>+CounterA: saveValue()
    DB->>+CounterB: saveValue()
    deactivate DB
    CounterA->>-CounterA:SaveValue()
    CounterB->>-CounterB:SaveValue()
```

It is missing a rollback, but that is pretty trivial.
