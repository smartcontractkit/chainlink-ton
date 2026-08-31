// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../lib/token_pool/messages"
import "../../accounts/deposit/messages"
import "../lockbox/messages"
import "types"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_WithdrawFailed
    | DepositAccount_Reply
    | DepositAccount_ForwardNotification;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

// TokenPool_GetCCVs and TokenPool_LockOrBurnWithdraw bounces are handled by the base library's
// shared TokenPool.onBouncedMessage (see TokenPool_BouncedMessage), so they are not listed here.
type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer
    | DepositAccount_Init;
