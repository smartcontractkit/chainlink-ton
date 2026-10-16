// SPDX-License-Identifier: BUSL-1.1

import "@stdlib/gas-payments"

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"
import "../../../lib/budget/gas"
import "../../cct/fees-management"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const BurnMintTokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.BurnMintTokenPool";
const BurnMintTokenPool_FACILITY_ID = BurnMintTokenPool_FACILITY_NAME.crc32() % 640 + 10;

const BurnMintTokenPool_CLAIM_ADMIN_VALUE = grams("0.05");

/// Known CCT wallets need only a small cushion over the reference transfer estimate.
const CCT_TRANSFER_BUFFER_PCT = 110;
/// TODO: calibrate CCT MintNewJettons compute against cold/warm wallet traces. This deliberately
/// conservative seed covers minter execution only, not wallet execution or continuation work.
const CCT_MINT_OP_GAS_UNITS = BUDGET_UNITS_LVL1_LOW;
const CCT_MINT_STORAGE_RESERVE = grams("0.01"); // Matches CCT JettonMinter's RAWRESERVE.

/// CCT MintNewJettons retains its compute cost, wallet-deployment forwarding fee and storage
/// reserve. Charge the full reserve conservatively even when the minter is already funded.
fun cctMintOpBudget(fwdFee: coins): coins {
    return calculateGasFee(MY_WORKCHAIN, CCT_MINT_OP_GAS_UNITS)
        + fwdFee + forwardInitStateOverhead() + CCT_MINT_STORAGE_RESERVE;
}

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
    rmnAdmin: address;
    jettonClient: JettonClient;
    tokenDecimals: uint8;
    router: address;
    /// Deployables code for deriving source-chain deposit accounts (OnRampAccount).
    deployableCode: cell? = null;
}
