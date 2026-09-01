// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../lib/token_pool/types"
import "../lib/token_pool/entrypoint"

import "types"

/// @notice Pool storage: common pool data + OffRampAccount code for deployment.
struct Storage {
    poolData: Cell<TokenPool_Data>;
    /// Compiled code cell of the OffRampAccount contract (deployed per-operation).
    offRampAccountCode: cell;
    /// Accrued lock/burn fees held in the pool's own Jetton wallet that `withdrawFeeTokens`
    /// may move. Lives only here (lock/release) — burn/mint and lockbox have no ledger and
    /// fall back to the unbounded default in the base token pool.
    accruedFees: coins;
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
                advancedPoolHooks: null, // opt-in; wired later via setAdvancedPoolHooks
                deployableCode: config.deployableCode,
            }.toCell(),
            localPolicy: TokenPool_LocalPolicy {
                cursedSubjects: CursedSubjects {
                    data: createEmptyMap(),
                },
            }.toCell(),
            tokenDecimals: config.tokenDecimals,
            remoteChainConfigs: createEmptyMap(),
            tokenTransferFeeConfigs: createEmptyMap(),
        }.toCell(),
        offRampAccountCode: config.offRampAccountCode,
        accruedFees: 0,
    };
}
