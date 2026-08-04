// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../lib/token_pool/types"
import "../lib/token_pool/entrypoint"

import "types"

/// @notice Pool storage: common pool data + ContextExecutor deployment state.
struct Storage {
    poolData: Cell<TokenPool_Data>;
    /// Compiled code cell of the ContextExecutor contract (deployed per-operation).
    contextExecutorCode: cell;
    /// Monotonically increasing ID for deterministic ContextExecutor address derivation.
    contextExecutorNextId: uint64;
}

@inline
/// @notice Returns true if the next ContextExecutor ID has not reached max uint64.
fun Storage.canTakeContextExecutorNextId(self): bool {
    return self.contextExecutorNextId != 18446744073709551615;
}

@inline
/// @notice Atomically takes and increments the next ContextExecutor ID.
/// @dev Throws if the ID counter has reached its maximum value.
fun Storage.takeContextExecutorNextId(mutate self): uint64 {
    val id = self.contextExecutorNextId;
    assert(id != 18446744073709551615) throw 0xFFFF;
    self.contextExecutorNextId = id + 1;
    return id;
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
        contextExecutorCode: config.contextExecutorCode,
        contextExecutorNextId: 1,
    };
}
