// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const BurnMintTokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.BurnMintTokenPool";
const BurnMintTokenPool_FACILITY_ID = BurnMintTokenPool_FACILITY_NAME.crc32() % 640 + 10;

const BurnMintTokenPool_CLAIM_ADMIN_VALUE = grams("0.05");
const BurnMintTokenPool_BURN_VALUE = grams("0.05");
const BurnMintTokenPool_MINT_VALUE = grams("0.1");

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

/// Error codes for BurnMintTokenPool. FACILITY_ID = 450, so codes start at 45000.
enum BurnMintTokenPool_Error {
    UnexpectedBurnBounce = BurnMintTokenPool_FACILITY_ID * 100 // 45000
    UnexpectedMintBounce // 45001
    InvalidOffRampAccountReply // 45002
    InvalidOffRampAccountNotification // 45003
    OffRampAccountDeployFailed // 45004
}

// TODO: remove?
struct BurnMintTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    offRampAccountCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
    /// Deployables code for deriving source-chain deposit accounts (OnRampAccount).
    deployableCode: cell? = null;
}
