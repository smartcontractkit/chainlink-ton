// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../../accounts/off_ramp_account/messages"

type LockReleaseTokenPool_InMessage =
    | OffRampAccount_Reply
    | OffRampAccount_ForwardNotification
    | ReturnExcessesBack;

type LockReleaseTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseTokenPool_BouncedMessage =
    | AskToTransfer
    | OffRampAccount_Init;
