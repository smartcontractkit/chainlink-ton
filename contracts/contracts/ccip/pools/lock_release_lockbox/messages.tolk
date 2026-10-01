// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../../lib/deployable/types"
import "../lib/token_pool/messages"
import "../../accounts/deposit/messages"
import "../lockbox/messages"
import "types"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_WithdrawFailed
    | DepositAccount_Reply
    | DepositAccount_NotEnoughValue
    | DepositAccount_ForwardNotification;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer
    | Deployable_InitializeAndSend
    | TokenPool_GetCCVs;
