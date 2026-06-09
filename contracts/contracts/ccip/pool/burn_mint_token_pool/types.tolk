// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client.tolk"
import "../../rmn_remote/lib"
import "../types"

const BurnMintTokenPool_CONTRACT_NAME = "BurnMintTokenPool".literalSlice();
const BurnMintTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
const BurnMintTokenPool_CLAIM_ADMIN_VALUE = ton("0.05");
const BurnMintTokenPool_BURN_VALUE = ton("0.05");
const BurnMintTokenPool_MINT_VALUE = ton("0.1");
const BurnMintTokenPool_REPLY_VALUE = ton("0.01");

struct BurnMintTokenPool_PendingBurn {
    replyTo: address? = null;
    request: Cell<TokenPool_LockOrBurnInV1>;
    out: Cell<TokenPool_LockOrBurnOutV1>;
    destTokenAmount: uint256;
    expectedSender: address;
}

struct BurnMintTokenPool_PendingMint {
    replyTo: address? = null;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
    expectedSender: address;
}

struct BurnMintTokenPool_Config {
    owner: address;
    token: address;
    tokenDecimals: uint8;
    rmnProxy: address;
    router: address;
    jettonClient: JettonClient;
}
