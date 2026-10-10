// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../lib/token_pool/messages"
import "../lockbox/messages"
import "types"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_WithdrawFailed;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer
    | TokenPool_GetCCVs;
