// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../types"

const LockReleaseTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.LockReleaseTokenPool".literalSlice();
const LockReleaseTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
const LockReleaseTokenPool_RELEASE_TRANSFER_VALUE = ton("0.05");
const LockReleaseTokenPool_REPLY_VALUE = ton("0.01");

struct LockReleaseTokenPool_PendingRelease {
    replyTo: address?;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
    expectedSender: address;
}

struct LockReleaseTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
}
