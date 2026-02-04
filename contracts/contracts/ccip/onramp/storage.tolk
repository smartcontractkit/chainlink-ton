// SPDX-License-Identifier: BUSL-1.1
import "types"
import "../../lib/access/ownable_2step"

struct OnRamp_Storage {
    id: uint32;
    ownable: Ownable2Step;

    // static config
    chainSelector: uint64; // source chain selector

    // dynamic config
    config: Cell<OnRamp_DynamicConfig>;

    destChainConfigs: map<uint64, OnRamp_DestChainConfig>; // chainSelector -> DestChainConfig
    executor: ExecutorDeployment;
}

fun OnRamp_Storage.load(): OnRamp_Storage {
    return OnRamp_Storage.fromCell(contract.getData());
}

fun OnRamp_Storage.store(self) {
    return contract.setData(self.toCell());
}
