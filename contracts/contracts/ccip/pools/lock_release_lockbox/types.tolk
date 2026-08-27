// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const LockReleaseLockboxTokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.LockReleaseLockboxTokenPool";
const LockReleaseLockboxTokenPool_FACILITY_ID = LockReleaseLockboxTokenPool_FACILITY_NAME.crc32() % 640 + 10;


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
    jettonClient: JettonClient;
    offRampAccountCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
    lockbox: address;
    /// Deployables code for deriving source-chain deposit accounts (OnRampAccount).
    deployableCode: cell? = null;
}
