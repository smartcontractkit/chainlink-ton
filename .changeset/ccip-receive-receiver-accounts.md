---
"@chainlink/contracts-ton": patch
---

Breaking change: `Receiver_CCIPReceiveV2` gains a trailing `receiverAccounts: array<address>` field: the Router-owned receiver accounts the message's tokens were delivered to, index-aligned with `message.tokenAmounts` (empty when the message has no tokens). Receivers must be rebuilt against the updated receiver library. The Go binding `offramp.CCIPReceiveV2` gets `ReceiverAccounts` (new `offramp.AddressArray` TLB type for Tolk `array<address>`).
