// SPDX-License-Identifier: BUSL-1.1
import "../token_pool.tolk"
import "../types"
import "../../rmn_remote/lib"
import "../../../lib/jetton/jetton_client.tolk"
import "../../../lib/access/ownable_2step.tolk"
import "types"

struct Storage {
    poolData: Cell<TokenPool_Data>;
    jettonClient: Cell<JettonClient>;
    pendingReleases: map<uint64, Cell<LockReleaseTokenPool_PendingRelease>>;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

fun LockReleaseTokenPool_initialStorage(config: LockReleaseTokenPool_Config): Storage {
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
        pendingReleases: createEmptyMap(),
    };
}
