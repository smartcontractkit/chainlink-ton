// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../lock_release/messages"
import "../lockbox/messages"

// Messages we receive from lockbox or jetton system:
// - JettonLockbox_Deposited: lockbox confirms deposit (lock flow completion)
// - JettonLockbox_WithdrawFailed: lockbox reports withdraw failure (release error)
// - ReturnExcessesBack: completion signal for both lock and release flows
type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockbox_Deposited
    | JettonLockbox_WithdrawFailed;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer;
