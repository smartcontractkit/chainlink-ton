// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../lib/token_pool/entrypoint"
import "../lib/token_pool/types"

import "types"

/// @notice Pool storage: common pool data. The off-ramp DepositAccount is deployed via the
/// Deployable pattern (its code is pinned in the pool's compiled code, not stored per-instance).
struct Storage {
    poolData: Cell<TokenPool_Data>;
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
                dynamicConfig: TokenPool_DynamicConfig {
                    router: config.router,
                    rateLimitAdmin: null,
                    feeAdmin: null,
                }.toCell(),
                jettonClient: config.jettonClient,
                allowedFinalityConfig: TOKEN_POOL_DEFAULT_FINALITY,
                advancedPoolHooks: createAddressNone() as address,
                deployableCode: config.deployableCode,
            }.toCell(),
            localPolicy: TokenPool_LocalPolicy {
                cursePolicy: CursePolicy.newWithAdmin(config.rmnAdmin),
            }.toCell(),
            tokenDecimals: config.tokenDecimals,
            remoteChainConfigs: createEmptyMap(),
            tokenTransferFeeConfigs: createEmptyMap(),
        }.toCell(),
    };
}
