---
id: contracts-ccip-token-registry
title: Token Registry
sidebar_label: Token Registry
sidebar_position: 2
---

# Token Registry (Not yet supported)

Unlike the EVM implementation where a single contract stores all the information about supported tokens and their Token Pools, in TON we will use a collection of contracts to store this information. This is because contract storage in TON is limited.

These cells will be initialized with the owner (the OnRamp) and the token address they represent. The address of these contracts can be calculated from this information. The contract will store the address of the Token Pool, and could have a flag to enable/disable the token.
