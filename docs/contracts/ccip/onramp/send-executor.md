---
id: contracts-ccip-onramp-send-executor
title: SendExecutor
sidebar_label: SendExecutor
sidebar_position: 3
---

# SendExecutor

This is a contract that is used by the OnRamp to store incoming CCIPSend messages. CCIPSend message is be persisted in a sharded map by deploying `SendExecutor` contracts. This serves to recover the message information in two situations:

1. When we get a bounced.
2. When we lockOrBurn tokens (as we won't be passing the whole ccipSend msg to the Token Pool).

This contracts is initialized with an owner (the OnRamp) and an id that must fit in a bounced message (224 bits). We can calculate its address with this information. This message id is randomized on every message processed.
