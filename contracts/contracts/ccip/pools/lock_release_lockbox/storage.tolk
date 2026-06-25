// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../types"
import "../token_pool"

import "types"

struct Storage {
    poolData: Cell<TokenPool_Data>;
    jettonClient: Cell<JettonClient>;
    lockbox: address;
    // Pending contexts keyed by queryId for async flow completion.
    pendingLocks: map<uint64, Cell<LockReleaseLockboxTokenPool_PendingLock>>;
    pendingReleases: map<uint64, Cell<LockReleaseLockboxTokenPool_PendingRelease>>;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

fun LockReleaseLockboxTokenPool_initialStorage(config: LockReleaseLockboxTokenPool_Config): Storage {
    return Storage {
        poolData: TokenPool_Data {
            adminConfig: TokenPool_AdminConfig {
                ownable: Ownable2Step {
                    owner: config.owner,
                    pendingOwner: null,
                }.toCell(),
                rmnProxy: config.rmnProxy,
                dynamicConfig: TokenPool_DynamicConfig {
                    router: config.router,
                    rateLimitAdmin: null,
                    feeAdmin: null,
                }.toCell(),
                allowedFinalityConfig: TOKEN_POOL_DEFAULT_FINALITY,
                advancedPoolHooks: createAddressNone() as address,
            }.toCell(),
            mirroredPolicy: TokenPool_MirroredPolicy {
                onRamps: createEmptyMap(),
                offRamps: createEmptyMap(),
                cursedSubjects: CursedSubjects {
                    data: createEmptyMap(),
                },
            }.toCell(),
            token: config.token,
            tokenDecimals: config.tokenDecimals,
            remoteChainConfigs: createEmptyMap(),
            tokenTransferFeeConfigs: createEmptyMap(),
        }.toCell(),
        jettonClient: config.jettonClient.toCell(),
        lockbox: config.lockbox,
        pendingLocks: createEmptyMap(),
        pendingReleases: createEmptyMap(),
    };
}
