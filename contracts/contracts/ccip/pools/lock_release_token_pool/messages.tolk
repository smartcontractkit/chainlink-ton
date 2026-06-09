// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages.tolk"
import "../messages"

type LockReleaseTokenPool_InMessage =
    | TransferNotificationForRecipient
    | ReturnExcessesBack;

type LockReleaseTokenPool_BouncedMessage = AskToTransfer;
