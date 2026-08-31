// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../lib/token_pool/messages"
import "../../accounts/deposit/messages"

type LockReleaseTokenPool_InMessage =
    | DepositAccount_Reply
    | DepositAccount_ForwardNotification
    | ReturnExcessesBack;

type LockReleaseTokenPool_OutMessage =
    | AskToTransfer;

// TokenPool_GetCCVs and TokenPool_LockOrBurnWithdraw bounces are handled by the base library's
// shared TokenPool.onBouncedMessage (see TokenPool_BouncedMessage), so they are not listed here.
type LockReleaseTokenPool_BouncedMessage =
    | AskToTransfer
    | DepositAccount_Init;
