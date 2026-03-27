---
id: contracts-ccip-offramp-receive-executor
title: ReceiveExecutor
sidebar_label: ReceiveExecutor
sidebar_position: 3
---

# ReceiveExecutor

This is a contract that is used by the OffRamp to store incoming messages. Messages are persisted in a sharded map by deploying `ReceiveExecutor` contracts. It stores the message content, the merkle root address, the message state and the lastExecutionTimestamp. This serves to recover the message state in three situations:

1. When we get a bounced message from the receiver.
2. When the receiver confirms the execution.
3. When doing manual execution, validating the message was marked as failed.
