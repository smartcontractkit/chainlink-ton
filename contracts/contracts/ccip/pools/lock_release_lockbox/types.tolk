// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"

const LockReleaseLockboxTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.LockReleaseLockboxTokenPool".literalSlice();
const LockReleaseLockboxTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();

const LockReleaseLockboxTokenPool_CONTEXT_EXECUTOR_DEPLOY_VALUE = ton("0.02");

struct (0x4b92a8e8) LockReleaseLockboxTokenPool_LockContext {
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

struct (0xad5476ce) LockReleaseLockboxTokenPool_ReleaseContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

struct LockReleaseLockboxTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    contextExecutorCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
    lockbox: address;
}
