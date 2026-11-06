---
"@chainlink/contracts-ton": patch
---

Breaking change: on the receive side, the `ReceiveExecutorId` type is renamed to `ReceiveExecutionID` and every `execId` field is renamed to `execID` (`Receiver_CCIPReceiveV2`, `Router_CCIPReceiveConfirm`, `Router_RouteMessage`, OffRamp/ReceiveExecutor messages and events). Wire encoding and opcodes are unchanged; generated wrappers and the Go `offramp.CCIPReceiveV2.RootID` field (now `ExecID`) follow the new name.
