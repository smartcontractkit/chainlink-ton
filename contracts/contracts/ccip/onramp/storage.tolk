// SPDX-License-Identifier: BUSL-1.1
import "types"
import "../../lib/access/ownable_2step"

struct (0xf07fc051) OnRamp_Storage_V1_7_0 {
    id: uint32;
    ownable: Ownable2Step;

    // static config
    staticConfig: Cell<OnRamp_StaticConfig>;
    // dynamic config
    config: Cell<OnRamp_DynamicConfig>;

    destChainConfigs: map<uint64, OnRamp_DestChainConfig> = []; // chainSelector -> DestChainConfig

    // Total amount of fees currently reserved for in-flight send executors.
    // Reserved fees stay on the contract's balance but are committed: they are
    // excluded from `onWithdrawFeeTokens` and released (decremented) when the
    // executor reports success (fee consumed) or error (fee refunded).
    pendingFeeReservations: coins = 0;
}

fun OnRamp_Storage_V1_7_0.load(): OnRamp_Storage_V1_7_0 {
    return OnRamp_Storage_V1_7_0.fromCell(contract.getData());
}

fun OnRamp_Storage_V1_7_0.store(self) {
    return contract.setData(self.toCell());
}
