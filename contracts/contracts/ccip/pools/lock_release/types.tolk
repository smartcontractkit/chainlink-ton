// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"
import "../lib/token_pool/types"

const LockReleaseTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.LockReleaseTokenPool".literalSlice();
const LockReleaseTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
const LockReleaseTokenPool_RELEASE_TRANSFER_VALUE = ton("0.05");
const LockReleaseTokenPool_REPLY_VALUE = ton("0.01");
const LockReleaseTokenPool_CONTEXT_EXECUTOR_DEPLOY_VALUE = ton("0.02");

struct (0xed696f9b) LockReleaseTokenPool_ReleaseContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

struct LockReleaseTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    contextExecutorCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
}
