// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../../../lib/budget/gas"
import "../../../lib/budget/min_value"
import "../lib/token_pool/messages"
import "../lib/token_pool/budget"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const LockReleaseLockboxTokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.LockReleaseLockboxTokenPool";
const LockReleaseLockboxTokenPool_FACILITY_ID = LockReleaseLockboxTokenPool_FACILITY_NAME.crc32() % 640 + 10;

/// Pool-type default safety budgets for wGRAM-like wallets, measured by the gas-report tests at
/// 66.67 nTON/gas. Raise per instance (`TokenPool_SetBudget`) for jettons with costlier wallets.
/// LockOrBurn: the custody notification funds pool -> lockbox -> finalize (~0.012 TON); ~3.5x.
const LockReleaseLockboxTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS = BUDGET_UNITS_LVL4_XHIGH; // ~0.0417 TON
/// ReleaseOrMint: the withdraw transaction funds pool -> lockbox -> recipient wallet (~0.015 TON);
/// ~2.8x. The caller's continuation is added on top.
const LockReleaseLockboxTokenPool_RELEASE_OR_MINT_SAFETY_GAS_UNITS = BUDGET_UNITS_LVL4_XHIGH; // ~0.0417 TON

fun LockReleaseLockboxTokenPool_defaultBudget(): TokenPool_Budget {
    return {
        lockOrBurn: TokenPool_FlowBudget.fromSafety(calculateMinValue(LockReleaseLockboxTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS, 1)),
        releaseOrMint: TokenPool_FlowBudget.fromSafety(calculateMinValue(LockReleaseLockboxTokenPool_RELEASE_OR_MINT_SAFETY_GAS_UNITS, 1)),
    };
}

/// @notice Context passed for lock (deposit) operations.
/// Carries the full forward payload for post-lock finalization.
struct (0x60fdb63b) LockReleaseLockboxTokenPool_LockContext {
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

/// @notice Context passed to OffRampAccount for release (withdraw) operations.
/// Carries the full forward payload for post-release finalization.
struct (0x90230477) LockReleaseLockboxTokenPool_ReleaseContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

/// Error codes for LockReleaseLockboxTokenPool. FACILITY_ID = 209, so codes start at 20900.
enum LockReleaseLockBoxTokenPool_Error {
    LockBoxNotConfigured = LockReleaseLockboxTokenPool_FACILITY_ID * 100 // 20900
    UnexpectedLockboxConfirmationSender // 20901

    UnexpectedLockBounce // 20902
    InvalidOffRampAccountReply // 20903
    InvalidOffRampAccountNotification // 20904
    OffRampAccountDeployFailed // 20905
    // The lockbox reported that the jetton transfer for a release (withdraw) bounced.
    LockBoxWithdrawFailed // 20906
}

// TODO: remove?
struct LockReleaseLockboxTokenPool_InitConfig {
    owner: address;
    rmnAdmin: address;
    jettonClient: JettonClient;
    tokenDecimals: uint8;
    router: address;
    lockbox: address;
    /// Deployables code for deriving source-chain deposit accounts (OnRampAccount).
    deployableCode: cell? = null;
}
