---
id: contracts-overview-contracts-other-deployable
slug: deployable
title: Deployable
sidebar_label: Deployable
sidebar_position: 3
---

# Deployable Contract

This library provides a standard init state for contracts, with a predictable data that includes the facility name of the contract. This allows for deterministic addresses for contracts, even across different versions, as long as they use the same facility name. The issue is described in more detail in the [Development guide > Making addresses deterministic](../development.md#making-addresses-deterministic).

## Storage

The library init state data has been kept to a minimum, with only an owner and an id field. The id field is a generic type that can be used to differentiate between different instances of the same contract.

```tolk
struct Deployable<T> {
    owner: address;
    id: T // builder on serialize, RemainingBitsAndRefs on deserialize
}
```

The function `NamespacedDeployableData` provides a standard way to create the init data for a deployable contract, by encoding the facility name and the id in a predictable way. Extracting this function into a separate file allows us to use different namespacing methods in different places, without changing the bytecode of the deployable contract.

```
struct NamespacedDeployableDataProps<T> {
    namespace: Namespace;
    owner: address;
    id: T;
}

fun NamespacedDeployableData<T>(props: NamespacedDeployableDataProps<T>): cell
```
