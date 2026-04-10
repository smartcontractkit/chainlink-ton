---
id: contracts-overview-libraries-index
title: Libraries
sidebar_label: Overview
sidebar_position: 1
---

# Libraries

This section documents shared contract libraries used across the TON smart contracts in this repository.

## Composability

### Namespacing

Similarly to the strategy used in [contract development](../../development.md#namespacing), we prefix struct names with the library name and an underscore (i.e. `LibraryName_StructName`) to ensure uniqueness across the codebase.

### Inheritance

Being able to create reusable components has been challenging in the Tolk language, as it doesn't support inheritance. We came up with a couple of different approaches to achieve composability.

#### Struct as a subcomponent

We provide a struct that exposes methods for handling messages as it were a subcomponent of the main contract. For example, in the [Ownable2Step library](./ownable_2step.md), we have an `Ownable2Step` struct that contains the state of the ownable component and a `onInternalMessage(mutate self, sender: address, body: slice): bool` method that handles ownership transfer messages. The main contract includes an `Ownable2Step` field in its storage and calls the `onInternalMessage` method from its `onInternalMessage` entry point. If a message is handled by the library, it returns `true` and the main contract doesn't execute any further logic.

#### Wrapper message

The previous approach was not enough for the case of the [Router](../ccip/router/index.md), as it has two owners. To solve this, we created a wrapper message `Router_RMNOwnableMessage` with its own opcode, allowing us to route the message to the correct entry point.

```tolk
struct (0xaf7a9ac6) Router_RMNOwnableMessage {
    content: RemainingBitsAndRefs; // Ownable2Step_Messages
}
```

#### Callbacks

In some cases, we want the contract implementation to provide some data to the library, or an implementation for a subtask. For that, we use the fields of a struct to pass those values. Take for example the [Upgradeable library](./upgradeable.md).

```tolk
struct Upgradeable {
    migrate: (cell, slice) -> cell;
    version: () -> slice;
}

fun Upgradeable.upgrade(self, msg: Upgradeable_Upgrade)
```

The contract is expected to handle the `Upgradeable_Upgrade` message, validate the sender and then call the `upgrade` method of the library, passing the message as a parameter, and the callbacks as part of the struct. The library then calls the `version` callback to check the version of the contract and the `migrate` callback to get the new code and data for the contract.

```tolk
Upgradeable{ migrate, version }.upgrade(msg);
```

#### Getters

If a library declares getters, these are also exposed by the main contract, but the library is unable to access the state of the main contract. Thus, we have settled on the library exposing helper functions that the main contract can call from its getters. Example of [Ownable2Step](./ownable_2step.md):

```tolk
/// Gets the current owner of the contract.
get fun owner(): address {
    val st = lazy Storage.load();
    return st.ownable.get_owner();
}
```

## Libraries

- [Ownable2Step](./ownable_2step.md)
- [Upgradeable](./upgradeable.md)
- [MerkleMultiProof](./merkle_multi_proof.md)
