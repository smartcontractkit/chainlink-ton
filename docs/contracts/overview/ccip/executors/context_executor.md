# Context Executor

ContextExecutor is a contract that allows an owner store some context and ask for it or forward it along with **filtered** incoming messages. It can be used to implement various cross-contract call patterns, where some context needs to be preserved across multiple calls.

## Basic flow

1. On/OffRamp initializes the Executor
2. Executor calls to sharded TP registry
3. TP registry replies with TP address
4. Executor uses On/OffRamp to proxy operations to TP (lockOrBurn/mintOrRelease)
5. TP uses the Executor as a ContextExecutor to store contex for the current message, and forward messages from specific senders (accelerates the flow)

## Core operations

1. ContextExecutor_Set -> ContextExecutor_Reply
2. ContextExecutor_Ask -> ContextExecutor_Reply
3. InMessage from: context.toForward -> ContextExecutor_ForwardNotification
