// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../types"
import "../messages"

const LockReleaseLockboxTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.LockReleaseLockboxTokenPool".literalSlice();
const LockReleaseLockboxTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();

// Pending lock context stored by queryId until lockbox confirms deposit.
// On JettonLockbox_Deposited, pool restores this and finalizes the lock flow.
struct LockReleaseLockboxTokenPool_PendingLock {
    queryId: uint64;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

// Pending release context stored by queryId until ReturnExcessesBack arrives.
// On ReturnExcessesBack, pool restores this and finalizes the release flow.
struct LockReleaseLockboxTokenPool_PendingRelease {
    queryId: uint64;
    replyTo: Cell<address?>;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
}

struct LockReleaseLockboxTokenPool_Config {
    owner: address;
    token: address;
    tokenDecimals: uint8;
    rmnProxy: address;
    router: address;
    jettonClient: JettonClient;
    lockbox: address;
}
