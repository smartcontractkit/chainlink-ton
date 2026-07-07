// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"

struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
    queryId: uint64;
}

type BurnMintTokenPool_InMessage =
    | BurnMintTokenPool_ClaimMinterAdmin
    | ReturnExcessesBack;

type BurnMintTokenPool_OutMessage =
    | ClaimMinterAdmin
    | MintNewJettons
    | AskToBurn;
