// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/access/ownable_2step"
import "../../rmn_remote/lib"
import "../lib/token_pool/types"
import "../lib/token_pool/entrypoint"

import "types"

/// @notice Pool storage: common pool data, lockbox reference, + OffRampAccount code for deployment.
struct Storage {
    poolData: Cell<TokenPool_Data>;
    /// Address of the JettonLockBox contract used for deposit/withdraw operations.
    lockbox: address;
    /// Compiled code cell of the OffRampAccount contract (deployed per release operation).
    offRampAccountCode: cell;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

// Initializes the storage with the given configuration.
fun Storage.init(config: LockReleaseLockboxTokenPool_InitConfig): Storage {
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
                deployableCode: config.deployableCode,
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
        lockbox: config.lockbox,
        offRampAccountCode: config.offRampAccountCode,
    };
}
