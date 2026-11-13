import "../../lib/access/ownable_2step"
import "types"

struct (0xf298db16) FeeQuoter_Storage_V1_7_0 {
    id: uint32;
    ownable: Ownable2Step;
    allowedPriceUpdaters: map<address, ()> = [];

    maxFeeJuelsPerMsg: uint96;
    linkToken: address;

    // @deprecated no longer use to validate token prices
    tokenPriceStalenessThreshold: uint32;

    // NOTE: usdPerUnitGasByDestChain is on DestChainConfig instead (same as Solana)
    usdPerToken: map<address, TimestampedPrice> = [];
    // NOTE: use presence in this map to validate a token as feeToken
    premiumMultiplierWeiPerEth: map<address, uint64> = [];

    destChainConfigs: map<uint64, DestChainConfig> = []
}

fun FeeQuoter_Storage_V1_7_0.load(): FeeQuoter_Storage_V1_7_0 {
    return FeeQuoter_Storage_V1_7_0.fromCell(contract.getData());
}

fun FeeQuoter_Storage_V1_7_0.store(self) {
    return contract.setData(self.toCell());
}
