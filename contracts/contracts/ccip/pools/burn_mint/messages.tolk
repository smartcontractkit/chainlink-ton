// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../../cct/messages"
import "../../accounts/off_ramp_account/messages"
import "types"

struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
    queryId: uint64;
}

type BurnMintTokenPool_InMessage =
    | BurnMintTokenPool_ClaimMinterAdmin
    | CCT_ReturnExcessesBack
    | OffRampAccount_Reply
    | OffRampAccount_ForwardNotification;

type BurnMintTokenPool_OutMessage =
    | ClaimMinterAdmin
    | MintNewJettons
    | CCT_AskToBurn;

type BurnMintTokenPool_BouncedMessage =
    | CCT_AskToBurn
    | MintNewJettons;
