// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages.tolk"
import "../messages"

struct (0x93c174a1) BurnMintTokenPool_ClaimMinterAdmin {
    queryId: uint64;
}

type BurnMintTokenPool_InMessage =
    | TransferNotificationForRecipient
    | BurnMintTokenPool_ClaimMinterAdmin
    | ReturnExcessesBack;
