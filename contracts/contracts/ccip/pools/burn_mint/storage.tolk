// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../token_pool"
import "../types"

import "types"

struct Storage {
    poolData: Cell<TokenPool_Data>;
    // Local storage used for MVP, won't scale to high volume of concurrent messages
    // with 65,536 cells per contract limit.
    // TODO: replace with sharded ContextExecutor per message
    pendingBurns: map<uint64, Cell<BurnMintTokenPool_PendingBurn>>;
    pendingMints: map<uint64, Cell<BurnMintTokenPool_PendingMint>>;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

// Initializes the storage with the given configuration.
fun Storage.init(config: BurnMintTokenPool_InitConfig): Storage {
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
        pendingBurns: createEmptyMap(),
        pendingMints: createEmptyMap(),
    };
}