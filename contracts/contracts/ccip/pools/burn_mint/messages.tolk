// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../../cct/messages"
import "../../accounts/deposit/messages"

struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
    queryId: uint64;
}

type BurnMintTokenPool_InMessage =
    | BurnMintTokenPool_ClaimMinterAdmin
    | CCT_ReturnExcessesBack
    | DepositAccount_Reply
    | DepositAccount_ForwardNotification;

type BurnMintTokenPool_OutMessage =
    | AskToTransfer
    | CCT_AskToBurn
    | MintNewJettons
    | ClaimMinterAdmin;

type BurnMintTokenPool_BouncedMessage =
    | AskToTransfer
    | CCT_AskToBurn
    | MintNewJettons
    | DepositAccount_Init;
