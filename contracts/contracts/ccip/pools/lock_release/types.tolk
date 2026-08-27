// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/messages"

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const LockReleaseTokenPool_FACILITY_NAME = "link.chain.ton.ccip.LockReleaseTokenPool";
const LockReleaseTokenPool_FACILITY_ID = LockReleaseTokenPool_FACILITY_NAME.crc32() % 640 + 10;

const LockReleaseTokenPool_REPLY_VALUE = ton("0.01");
const LockReleaseTokenPool_OFF_RAMP_ACCOUNT_DEPLOY_VALUE = ton("0.1");

/// @notice Context passed to OffRampAccount for release operations.
/// Carries the full forward payload for post-release finalization.
struct (0xed696f9b) LockReleaseTokenPool_ReleaseContext {
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

enum Error {
    UnexpectedReleaseBounce = LockReleaseTokenPool_FACILITY_ID * 100
    InvalidOffRampAccountReply
    InvalidOffRampAccountNotification
    OffRampAccountDeployFailed
}

// TODO: remove?
struct LockReleaseTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    offRampAccountCode: cell;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
    /// Deployables code for deriving source-chain deposit accounts (OnRampAccount).
    deployableCode: cell? = null;
}
