# JettonLockBox

`link.chain.ton.ccip.pool.JettonLockBox`

> Generated from `build/abi` + `// minval` markers. Do not edit by hand.

| Message | Category | Gate | Summary |
| --- | --- | --- | --- |
| `JettonLockBox_Init` | check-bounce | S | one-time init; reject shortfall before binding initializer or changing configuration |
| `JettonLockBox_Withdraw` | check-bounce | S | reject before withdrawing custody; operator handles the request bounce |
| `TransferNotificationForRecipient` | check-fail | S | authenticated deposit; shortfall uses the correlated custody-return path |
