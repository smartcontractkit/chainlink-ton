// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"

const LockReleaseLockboxTokenPool_CONTRACT_NAME = "link.chain.ton.ccip.LockReleaseLockboxTokenPool".literalSlice();
const LockReleaseLockboxTokenPool_CONTRACT_VERSION = "0.1.0".literalSlice();

// Pending lock context stored by queryId until lockbox confirms deposit.
// On JettonLockBox_Deposited, pool restores this and finalizes the lock flow.
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

struct LockReleaseLockboxTokenPool_InitConfig {
    owner: address;
    jettonClient: JettonClient;
    tokenDecimals: uint8;
    router: address;
    rmnProxy: address;
    lockbox: address;
}
