// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../lib/gas"

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
/// LockOrBurn admission: entry, withdraw relay, and three custody phases (`3 * S`).
const LockReleaseLockboxTokenPool_LOCK_OR_BURN_ADMISSION_GAS_UNITS = 1_575_000; // ~0.105 TON base
/// ReleaseOrMint safety: the lockbox transfer plus the pool's post-delivery finalization.
const LockReleaseLockboxTokenPool_RELEASE_OR_MINT_SAFETY_GAS_UNITS = 375_000; // ~0.025 TON
/// ReleaseOrMint admission: pool -> lockbox -> recipient wallet (~0.015 TON); ~3.9x. Includes the
/// finalization safety; the caller's delivery forward is added on top.
const LockReleaseLockboxTokenPool_RELEASE_OR_MINT_ADMISSION_GAS_UNITS = 875_000; // ~0.058 TON

struct LockReleaseLockboxTokenPool_Costs{}

fun LockReleaseLockboxTokenPool_Costs.lockOrBurnAdmission(): coins {
    val w = contract.getAddress().getWorkchain();
    return calculateGasFee(w, LockReleaseLockboxTokenPool_LOCK_OR_BURN_ADMISSION_GAS_UNITS)
        + MIN_GRAM_TO_RESERVE_RUNTIME;
}

fun LockReleaseLockboxTokenPool_Costs.lockOrBurnSafety(): coins {
    val w = contract.getAddress().getWorkchain();
    return calculateGasFee(w, LockReleaseLockboxTokenPool_LOCK_OR_BURN_SAFETY_GAS_UNITS);
}

fun LockReleaseLockboxTokenPool_Costs.releaseOrMintAdmission(): coins {
    val w = contract.getAddress().getWorkchain();
    return calculateGasFee(w, LockReleaseLockboxTokenPool_RELEASE_OR_MINT_ADMISSION_GAS_UNITS)
        + MIN_GRAM_TO_RESERVE_RUNTIME;
}

fun LockReleaseLockboxTokenPool_Costs.releaseOrMintSafety(): coins {
    val w = contract.getAddress().getWorkchain();
    return calculateGasFee(w, LockReleaseLockboxTokenPool_RELEASE_OR_MINT_SAFETY_GAS_UNITS);
}

fun LockReleaseLockboxTokenPool_defaultBudget(): TokenPool_Budget {
    return {
        lockOrBurn: {
            admission: LockReleaseLockboxTokenPool_Costs.lockOrBurnAdmission(),
            safety: LockReleaseLockboxTokenPool_Costs.lockOrBurnSafety(),
        },
        releaseOrMint: {
            admission: LockReleaseLockboxTokenPool_Costs.releaseOrMintAdmission(),
            safety: LockReleaseLockboxTokenPool_Costs.releaseOrMintSafety(),
        },
    };
}

/// @notice Context passed for lock (deposit) operations.
/// Carries the full forward payload for post-lock finalization.
struct (0x60fdb63b) LockReleaseLockboxTokenPool_LockContext {
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
    transferInitiator: address; // incoming transfer notification's initiator (the source DA)
}

/// @notice Context passed to ReceiverAccount for release (withdraw) operations.
/// Carries the full forward payload for post-release finalization.
struct (0x90230477) LockReleaseLockboxTokenPool_ReleaseContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

/// Error codes for LockReleaseLockboxTokenPool. FACILITY_ID = 209, so codes start at 20900.
enum LockReleaseLockBoxTokenPool_Error {
    LockBoxNotConfigured = LockReleaseLockboxTokenPool_FACILITY_ID * 100 // 20900
    UnexpectedLockboxConfirmationSender // 20901

    UnexpectedLockBounce // 20902
    InvalidReceiverAccountReply // 20903
    InvalidReceiverAccountNotification // 20904
    ReceiverAccountDeployFailed // 20905
    // The lockbox reported that the jetton transfer for a release (withdraw) bounced.
    LockBoxWithdrawFailed // 20906
}
