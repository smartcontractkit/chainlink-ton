---
"@chainlink/contracts-ton": patch
---

Breaking change: `Router_GetValidatedFee` now starts with `queryId: uint64`, which the Router echoes back in `Router_MessageValidated` and `Router_MessageValidationFailed` (also new leading `queryId` field). The deprecated V1 messages are unchanged (V1 requests are processed with `queryId = 0`).
