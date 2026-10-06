// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../../../lib/deployable/types"
import "../lib/token_pool/messages"
import "../../cct/messages"
import "../../accounts/deposit/messages"

struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
    queryId: uint64;
}

type BurnMintTokenPool_InMessage =
    | BurnMintTokenPool_ClaimMinterAdmin
    | CCT_ReturnExcessesBack
    | DepositAccount_Reply
    | DepositAccount_NotEnoughValue
    | DepositAccount_ForwardNotification;

type BurnMintTokenPool_OutMessage =
    | AskToTransfer
    | CCT_AskToBurn
    | MintNewJettons
    | ClaimMinterAdmin;

// TokenPool_GetCCVs and TokenPool_LockOrBurnWithdraw bounces are handled by the base library's
// shared TokenPool.onBouncedMessage (see TokenPool_BouncedMessage), so they are not listed here.
type BurnMintTokenPool_BouncedMessage =
    | AskToTransfer
    | CCT_AskToBurn
    | MintNewJettons
    | DepositAccount_Init;
