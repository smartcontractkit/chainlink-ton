// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../../accounts/deposit/types"

const LockReleaseLockboxTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.LockReleaseLockboxTokenPool".literalSlice();
const LockReleaseLockboxTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();
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
