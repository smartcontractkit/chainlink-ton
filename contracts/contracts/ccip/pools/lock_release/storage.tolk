// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../lib/token_pool/types"
import "../lib/token_pool/entrypoint"

import "types"

struct Storage {
    poolData: Cell<TokenPool_Data>;
    // TODO: replace with sharded ContextExecutor per message
    pendingReleases: map<uint64, Cell<LockReleaseTokenPool_PendingRelease>>;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

// Initializes the storage with the given configuration.
fun Storage.init(config: LockReleaseTokenPool_InitConfig): Storage {
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
                jettonClient: config.jettonClient,
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
            tokenDecimals: config.tokenDecimals,
            remoteChainConfigs: createEmptyMap(),
            tokenTransferFeeConfigs: createEmptyMap(),
        }.toCell(),
        pendingReleases: createEmptyMap(),
    };
}
