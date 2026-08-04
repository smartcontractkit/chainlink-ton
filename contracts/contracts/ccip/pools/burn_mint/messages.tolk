// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../../executors/context_executor/messages"
import "types"

struct (0x39898e4d) BurnMintTokenPool_ClaimMinterAdmin {
    queryId: uint64;
}

type BurnMintTokenPool_InMessage =
    | BurnMintTokenPool_ClaimMinterAdmin
    | ContextExecutor_Reply<BurnMintTokenPool_ContextExecutorContext>
    | ContextExecutor_ForwardNotification<BurnMintTokenPool_ContextExecutorContext>;

type BurnMintTokenPool_OutMessage =
    | ClaimMinterAdmin
    | MintNewJettons
    | AskToBurn;

type BurnMintTokenPool_BouncedMessage =
    | AskToBurn
    | MintNewJettons;
