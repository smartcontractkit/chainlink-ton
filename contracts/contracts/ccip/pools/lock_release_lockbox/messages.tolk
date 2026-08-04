// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../executors/context_executor/messages"
import "../lockbox/messages"
import "types"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_WithdrawFailed
    | ContextExecutor_Reply<LockReleaseLockboxTokenPool_ReleaseContext>
    | ContextExecutor_ForwardNotification<LockReleaseLockboxTokenPool_ReleaseContext>;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer;
