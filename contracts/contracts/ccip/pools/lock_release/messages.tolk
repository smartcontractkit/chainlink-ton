// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"

type LockReleaseTokenPool_InMessage =
    | ReturnExcessesBack;

type LockReleaseTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseTokenPool_BouncedMessage =
    | AskToTransfer;
