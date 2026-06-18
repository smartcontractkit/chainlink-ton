// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/jetton_client"
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../token_pool"
import "../types"

import "types"

struct Storage {
    poolData: Cell<TokenPool_Data>;
    jettonClient: Cell<JettonClient>;
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

fun BurnMintTokenPool_initialStorage(config: BurnMintTokenPool_Config): Storage {
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
        pendingBurns: createEmptyMap(),
        pendingMints: createEmptyMap(),
    };
}