// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../lib/jetton/jetton_client"

import "../lib/token_pool/messages"
import "../lib/token_pool/budget"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const LockReleaseLockboxTokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.LockReleaseLockboxTokenPool";
const LockReleaseLockboxTokenPool_FACILITY_ID = LockReleaseLockboxTokenPool_FACILITY_NAME.crc32() % 640 + 10;

/// Pool-type default budgets for wGRAM-like wallets, measured by the gas-report tests at
/// 66.67 nTON/gas. Raise per instance (`TokenPool_SetBudget`) for jettons with costlier wallets.
/// LockOrBurn safety: one custody phase. Covers success finalization or the best-effort return.
/// The first transfer carries `2S + F`; the lockbox deposit forwards `S + F`.
const LockReleaseLockboxTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS = 525_000; // ~0.035 TON
/// LockOrBurn admission: the entry, the withdraw relay and the custody transfer, which carries three
/// custody phases' safety (`3 * S`, ~0.105 TON).
const LockReleaseLockboxTokenPool_LOCK_OR_BURN_ADMISSION_GAS_UNITS = 1_575_000; // ~0.105 TON
/// ReleaseOrMint safety: the lockbox transfer plus the pool's post-delivery finalization.
const LockReleaseLockboxTokenPool_RELEASE_OR_MINT_SAFETY_GAS_UNITS = 375_000; // ~0.025 TON
/// ReleaseOrMint admission: pool -> lockbox -> recipient wallet (~0.015 TON); ~3.9x. Includes the
/// finalization safety; the caller's delivery forward is added on top.
const LockReleaseLockboxTokenPool_RELEASE_OR_MINT_ADMISSION_GAS_UNITS = 875_000; // ~0.058 TON

fun LockReleaseLockboxTokenPool_defaultBudget(): TokenPool_Budget {
    val w = contract.getAddress().getWorkchain();
    return {
        lockOrBurn: {
            admission: calculateGasFee(w, LockReleaseLockboxTokenPool_LOCK_OR_BURN_ADMISSION_GAS_UNITS),
            safety: calculateGasFee(w, LockReleaseLockboxTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS),
        },
        releaseOrMint: {
            admission: calculateGasFee(w, LockReleaseLockboxTokenPool_RELEASE_OR_MINT_ADMISSION_GAS_UNITS),
            safety: calculateGasFee(w, LockReleaseLockboxTokenPool_RELEASE_OR_MINT_SAFETY_GAS_UNITS),
        },
    };
}

/// @notice Context passed for lock (deposit) operations.
/// Carries the full forward payload for post-lock finalization.
struct (0x60fdb63b) LockReleaseLockboxTokenPool_LockContext {
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
    transferInitiator: address; // incoming transfer notification's initiator (the source DA)
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
}
