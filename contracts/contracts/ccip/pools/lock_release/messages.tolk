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

type LockReleaseTokenPool_BouncedMessage =
    | AskToTransfer
    | DepositAccount_Init
    | TokenPool_GetCCVs;
