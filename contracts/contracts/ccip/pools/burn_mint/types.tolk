// SPDX-License-Identifier: BUSL-1.1

import "@stdlib/gas-payments"

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"
import "../lib/token_pool/budget"
import "../../../lib/budget/gas"
import "../../../lib/budget/min_value"
import "../../cct/fees-management"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const BurnMintTokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.BurnMintTokenPool";
const BurnMintTokenPool_FACILITY_ID = BurnMintTokenPool_FACILITY_NAME.crc32() % 640 + 10;

const BurnMintTokenPool_CLAIM_ADMIN_VALUE = grams("0.05");

/// Pool-type default budgets, measured by the gas-report tests at 66.67 nTON/gas.
/// LockOrBurn safety: one custody phase. The first transfer carries two phases' safety; the burn
/// and minter path carry the remainder.
const BurnMintTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS = BUDGET_UNITS_LVL3_HIGH; // ~0.0167 TON
/// LockOrBurn admission: the entry, the withdraw relay and the custody transfer carrying two
/// custody phases' safety.
const BurnMintTokenPool_LOCK_OR_BURN_ADMISSION_GAS_UNITS = 750_000; // ~0.050 TON
/// ReleaseOrMint admission: pool -> minter -> recipient wallet (~0.014 TON); ~7x. The caller's
/// delivery forward is added on top.
const BurnMintTokenPool_RELEASE_OR_MINT_ADMISSION_GAS_UNITS = 1_500_000; // ~0.1 TON

/// Upper bound on the gas the mint transaction runs after its funding check: building and sending
/// the mint.
const BurnMintTokenPool_MINT_SEND_GAS_UNITS = BUDGET_UNITS_LVL0_MIN;

fun BurnMintTokenPool_defaultBudget(): TokenPool_Budget {
    return {
        lockOrBurn: {
            admission: calculateMinValue(BurnMintTokenPool_LOCK_OR_BURN_ADMISSION_GAS_UNITS, 1),
            safety: calculateMinValue(BurnMintTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS, 1),
        },
        releaseOrMint: {
            admission: calculateMinValue(BurnMintTokenPool_RELEASE_OR_MINT_ADMISSION_GAS_UNITS, 1),
        },
    };
}

/// CCT `MintNewJettons`: the minter's compute and the wallet-deploy message it sends. The minter
/// keeps its storage reserve from its own balance, so a mint leaves nothing behind in it.
fun cctMintOpBudget(walletDeployFee: coins): coins {
    return calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_Mint) + walletDeployFee;
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
