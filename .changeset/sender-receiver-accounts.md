---
"@chainlink/contracts-ton": patch
---

Breaking change: Router deposit accounts are renamed from OnRampAccount/OffRampAccount to SenderAccount/ReceiverAccount.

- Messages (new opcodes): `Router_GetSenderAccount` (`0x6cafd96f`), `Router_UseSenderAccount` (`0x900d5435`), `Router_SenderAccountFailed` (`0xda7b0350`), `Router_SenderAccountContext` (`0x4713c0b5`).
- Getters: `onRampAccountAddress` → `senderAccountAddress`, `offRampAccountAddress` → `receiverAccountAddress`.
- `Router_WithdrawToTokenPool.onRampAccount` → `senderAccount`; Router errors `SenderIsNotSenderAccount` / `SenderAccountWithdrawFailed` and pool errors `InvalidReceiverAccountReply` / `InvalidReceiverAccountNotification` / `ReceiverAccountDeployFailed` keep their codes.
- Deployable namespace values and derived account addresses are unchanged.
