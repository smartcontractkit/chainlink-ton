// SPDX-License-Identifier: BUSL-1.1
import "../messages"
import "../../../lib/jetton/messages.tolk"

type LockReleaseTokenPool_CustomInMessage =
    | TransferNotificationForRecipient
    | ReturnExcessesBack;

type LockReleaseTokenPool_BouncedMessage = AskToTransfer;
