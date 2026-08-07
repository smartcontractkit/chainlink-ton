// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"

const BurnMintTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.BurnMintTokenPool".literalSlice();
const BurnMintTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
const BurnMintTokenPool_CLAIM_ADMIN_VALUE = ton("0.05");
const BurnMintTokenPool_BURN_VALUE = ton("0.05");
const BurnMintTokenPool_MINT_VALUE = ton("0.1");
const BurnMintTokenPool_OFF_RAMP_ACCOUNT_DEPLOY_VALUE = ton("0.1");

/// Context carried by the CCT burn path (burn only). Stores the pool's own jetton
/// wallet address (the burn source) and the full forward payload for finalization.
struct (0xba302a47) BurnMintTokenPool_BurnContext {
    wallet: address;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

/// Context passed to OffRampAccount for mint (release) operations.
/// Carries the full forward payload for post-mint finalization.
struct (0xb3d52361) BurnMintTokenPool_MintContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

/// @notice Context stored in OffRampAccount for mint operations.
type BurnMintTokenPool_OffRampAccountContext = BurnMintTokenPool_MintContext;

struct BurnMintTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    offRampAccountCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
}
