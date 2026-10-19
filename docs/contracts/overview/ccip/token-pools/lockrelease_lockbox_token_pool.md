---
id: contracts-ccip-pools-lockrelease-lockbox-token-pool
title: LockRelease Lockbox TokenPool
sidebar_label: LockRelease Lockbox TokenPool
sidebar_position: 3
---

Every `TokenPool_LockOrBurn` and `TokenPool_ReleaseOrMint` requires a standard
`replyTo` address. Success and attributable failure paths always attempt a reply;
`addr_none` is invalid.

The pool retains transfer fees in its own jetton wallet and deposits the destination
amount into a separate `JettonLockBox`. The lockbox authenticates its wallet,
requires the pool's `OPERATOR_ROLE`, and validates the deposit token and amount.

## Rejected Deposits

`JettonLockBox_DepositFailed` (`0x5e28ebd8`) reports the query ID, token, depositor,
actual amount, decoded deposit context, error code, and `returnAttempted` flag.
The flag means that a best-effort return was queued, not that the wallet accepted
it or custody arrived. Malformed deposits can have a null context.

The pool authenticates the direct rejection from its configured lockbox, validates
the correlated context, refunds rate-limit capacity, and notifies the requester.
It does not assume tokens are back yet. An identifiable custody return carries
the rejection payload and positive forward TON. The pool accepts this receipt only
from its own wallet, with the lockbox as transfer initiator, matching context and
amount. It then attempts to return the original amount, including retained fees,
without refunding capacity or notifying the requester a second time.

## Recovery Funding

Recovery reserves the pre-message native balance before refund logs, custody
returns, or failure replies. A custody return uses a fixed `0.1 TON` wallet budget
plus any forward TON. It is skipped if the current inbound value cannot also fund
estimated compute, forwarding fees, and the separate failure reply budget; the
wallet budget is never reduced to fit the input. Failure replies use the remaining
unreserved balance. Return, failure-reply, and recovery-log sends are best-effort;
queuing a send does not guarantee downstream delivery.

Pool deposits forward the inbound value minus measured pool compute with the
existing execution-tail allowance, the serialized transfer's estimated forwarding
fee, storage fees, and the validated wallet-transfer budget. Inputs below this
overhead fail with `InsufficientMessageValue`. The remaining budget reaches the
lockbox without spending the pool's pre-message balance. Custody returns still use
`jettonLockBoxReturnForwardValue()` for the pool's restitution hop.
The fixed wallet budget is tested against the supported standard and CCT wallets;
different wallet code or network fee settings require revalidation.

Underfunded returns, downstream wallet rejection, and unidentifiable deposits can
leave custody in a pool or lockbox wallet. There are no persistent recovery records,
replay guards, or caller-funded retry operations in this design.
