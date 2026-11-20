---
"@chainlink/contracts-ton": patch
---

New permissionless Router message `Router_GetReceiverAccountAddress { queryId, token, context? }` (`0x0d5421b4`). The Router replies to the caller with `Router_ReceiverAccountAddress { queryId, account, token, context }` (`0xf540f227`), where `account` is the caller's receiver account for `token`. Nothing is deployed.
