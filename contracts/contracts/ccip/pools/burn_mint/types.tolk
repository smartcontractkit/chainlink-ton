// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"
import "../lib/token_pool/types"

const BurnMintTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.BurnMintTokenPool".literalSlice();
const BurnMintTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
const BurnMintTokenPool_CLAIM_ADMIN_VALUE = ton("0.05");
const BurnMintTokenPool_BURN_VALUE = ton("0.05");
const BurnMintTokenPool_MINT_VALUE = ton("0.1");
const BurnMintTokenPool_CONTEXT_EXECUTOR_DEPLOY_VALUE = ton("0.02");

struct (0xba302a47) BurnMintTokenPool_BurnContext {
    wallet: address;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

struct (0xb3d52361) BurnMintTokenPool_MintContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

type BurnMintTokenPool_ContextExecutorContext =
    | BurnMintTokenPool_BurnContext
    | BurnMintTokenPool_MintContext;

struct BurnMintTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    contextExecutorCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
}
