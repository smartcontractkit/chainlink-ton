// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../accounts/off_ramp_account/messages"
import "../lockbox/messages"
import "types"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_WithdrawFailed
    | OffRampAccount_Reply
    | OffRampAccount_ForwardNotification;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer
    | OffRampAccount_Init;
