import "../../lib/access/ownable_2step"
import "types"

struct Storage {
    id: uint32;
    ownable: Ownable2Step;

    maxFeeJuelsPerMsg: uint96;
    linkToken: address;
    tokenPriceStalenessThreshold: uint64;

    // TODO: this is on DestChain instead (same as Solana)
    // usdPerUnitGasByDestChain: map<uint64, TimestampedPrice>; // (idict len=64) chainSelector -> TimestampedPrice
    usdPerToken: map<address, TimestampedPrice>;
    // TODO: use presence in this map to validate a token as feeToken
    premiumMultiplierWeiPerEth: map<address, uint64>;

    destChainConfigs: map<uint64, DestChainConfig>
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
