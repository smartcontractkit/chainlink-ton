import "types"
import "../../lib/access/ownable_2step"

struct OnRamp_Storage {
    id: uint32;
    ownable: Ownable2Step;

    // static config
    chainSelector: uint64; // source chain selector
    // TODO: rmnRemote (only used to validate curse on getFee), nonceManager, tokenAdminRegistry
    // hmm, need to consider the design here.
    // probably like solana tokenAdminRegistry will be fused into onramp/router
    // but the problem is unbounded dict growth
    // it's only used to resolve getPoolBySourceToken when calling lockOrBurn
    // maybe onramp -> feeQuoter -> tokenAdminRegistry(token instance) -> tokenPool.LockAndBurn?
    // NOTE: fee quoter also processes pool return data

    // dynamic config
    config: Cell<OnRamp_DynamicConfig>;

    destChainConfigs: map<uint64, OnRamp_DestChainConfig>; // chainSelector -> DestChainConfig
    executorCode: cell; // code for CCIPSendExecutor
    currentMessageId: uint224;
}

fun OnRamp_Storage.load(): OnRamp_Storage {
    return OnRamp_Storage.fromCell(contract.getData());
}

fun OnRamp_Storage.store(self) {
    return contract.setData(self.toCell());
}
