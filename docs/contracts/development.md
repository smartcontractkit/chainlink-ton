---
id: contracts-development
slug: development
title: Development
sidebar_label: Development
sidebar_position: 2
---

# Contract Development Guide

This document provides general guidance for developing smart contracts in the Chainlink TON repository. As the Tolk language is still in early stages of development, we settled on some standards for writing contracts.

## File structure

The recommended file structure for a contract is as follows:

```
contract_name/
├── contract.tolk  // main contract file with entry points and getters
├── messages.tolk  // message definitions
├── storage.tolk   // storage definitions
├── errors.tolk    // error codes and messages
└── types.tolk     // type definitions and facility (see below)
```

## Main file

The main contract file should be named `contract.tolk` and contain entry points of the contract and the getters

```tolk
fun onInternalMessage(in:InMessage)
fun onBouncedMessage(in: InMessageBounced) // optional

get fun typeAndVersion(): (slice, slice)
```

Note that we don't use the `get*` prefix on getter names, as it is implied by the `get` keyword.

### Namespacing

As Tolk is still in early stages of development, there is no support for namespacing, so we recommend using a consistent naming convention for structs to avoid naming conflicts. We use CamelCase for structs, but we prefix them with the contract name and an underscore (i.e. `ContractName_StructName`) to ensure uniqueness across the codebase.

## Messages

The `messages.tolk` contains message definitions. The opcode in parentheses is used to match the message with the corresponding entry point in the main contract file. By convention, we use a crc32 of the message struct name as the opcode.

```tolk
struct (0x12345678) ContractName_MessageName {
    field1: uint256;
}
```

For parsing messages in entrypoints, we declare a [union](https://docs.ton.org/tolk/types/unions) `ContractName_InMessage` that groups all possible incoming messages. We then use lazy parsing with `lazy ContractName_InMessage.fromSlice(in.body);` to efficiently handle the message data.

```tolk
type ContractName_InMessage =
    | ContractName_Msg1
    | ContractName_Msg2
    ;
```

Note that, in the union declaration, we put one message per line and the semicolon in an extra line  to make it easier to read and maintain as the number of messages grows.

### On message location

Of course, a message is imported and used by multiple contracts, some send it, and others receive it. We have come up with the following conventions to determine where to locate message definitions:

- If the interface is of type request-response, both the incoming and outgoing message definitions should be owned by the contract that receives the request.
- If the interface is of type proxy, the message definitions should be owned by the contract that receives the message.

This is not a strict rule, but we found it helps to keep the code organized and easier to navigate.

### Minimum value for processing a message

Contracts also expose helper functions to estimate the value required for processing a message, resulting from benchmarks. Note that these are defined at compile time, so to update them, the contract needs to be upgraded in place.

```tolk
struct ContractName_Costs{}

fun ContractName_Costs.messageName(): int {
    // value in nanotons
    return 100_000_000;
}
```

## Storage

The `storage.tolk` file contains the schema definition of the contract's storage.

```
struct ContractName_Storage {
    id: uint32;
    // ...
}
```

Every contract storage exposes a `load` and `store` methods for loading the storage from the blockchain and storing it back after mutating it. Most use the automatic serialization provided by Tolk, but for more complex cases, we have implemented some custom serialization.

```tolk
fun ContractName_Storage.load(): ContractName_Storage {
    return ContractName_Storage.fromCell(contract.getData());
}

fun ContractName_Storage.store(self) {
    return contract.setData(self.toCell());
}
```

## Facility

Contracts define a facility name and id on the `types.tolk` file. The facility name is returned on the `typeAndVersion` getter of the contract, and the facility id is used for preventing error codes from colliding across contracts and libraries.

```
const ContractName_FACILITY_NAME = "link.chain.ton.ccip.ContractName";
const ContractName_FACILITY_ID = 123;  // (crc32(<facility>) % 640) + 10
```

The facility name uses inverse domain notation (link.chain being the domain of CLL), following the pattern `link.chain.<network>.<module>.<contract>`.

The facility id is calculated with the crc32 of the facility name, scaling it to fit in the range of 10 to 649.

## Errors

The `errors.tolk` file contains error codes as an enum, where the first error is the error code:

```tolk
enum Error {
    ErrorNotFound = ContractName_FACILITY_ID * 100
    AnotherError
    // ...
}
```

The error code is given by the formula `facility_id * 100 + error_index`, resulting in all with the form `xxxyy`, where `xxx` is the facility id and `yy` is the error index, making it easy to identify the source of the error when it is returned by the contract.

## Making addresses deterministic

In TON, contract addresses are determined by the init state, i.e. the code and data used to deploy the contract. This allows a contract receiver of a message to verify that a sender is of a certain type by calculating the hash of the expected init state of the sender, with a known version of the code and a predictable data (for example, with a known owner or with the address of the receiver as a parameter, plus an id to allow for multiplicity). However, this creates an issue when a new version of a contract is released. Now, newer versions will have a different state init, thus a different address, making it impossible for the receiver to verify the sender is of the expected type. On the other hand, if the receiver switches to the new version, then it won't be able to receive messages from the old version.

To solve this issue, we created the [Deployable contract](./overview/deployable.md), which provides a standard init state for contracts, with a predictable data that includes the facility name of the contract. This allows us to have deterministic addresses for contracts, even across different versions, as long as they use the same facility name. The details of the implementation can be found in the [contract's documentation](./overview/deployable.md).
