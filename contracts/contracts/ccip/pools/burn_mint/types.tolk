// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"
import "../lib/token_pool/types"

const BurnMintTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.BurnMintTokenPool".literalSlice();
const BurnMintTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
const BurnMintTokenPool_CLAIM_ADMIN_VALUE = ton("0.05");
const BurnMintTokenPool_BURN_VALUE = ton("0.05");
const BurnMintTokenPool_MINT_VALUE = ton("0.1");

struct BurnMintTokenPool_PendingBurn {
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
    expectedSender: address;
}

struct BurnMintTokenPool_PendingMint {
    replyTo: address?;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
    expectedSender: address;
}

struct BurnMintTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
}
