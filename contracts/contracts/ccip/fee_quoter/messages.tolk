import "../types"

tolk 1.1

type FeeQuoter_InMessage =
    | FeeQuoter_UpdatePrices
    | FeeQuoter_UpdateFeeTokens
    | FeeQuoter_UpdateTokenTransferFeeConfigs
    | FeeQuoter_UpdateDestChainConfigs
    | FeeQuoter_GetValidatedFee<cell>; // marked as cell since we never attempt to load the metadata

struct (0x20000001) FeeQuoter_UpdatePrices {
    updates: PriceUpdates    
}

// crc32('FeeQuoter_GetValidatedFee')
struct (0x7496FF56) FeeQuoter_GetValidatedFee<C> {
    msg: Cell<CCIPSend>
    metadata: Cell<C>
}

struct FeeToken {
    premiumMultiplierWeiPerEth: uint64
}

// crc32('FeeQuoter_UpdateFeeTokens')
struct (0xD0984986) FeeQuoter_UpdateFeeTokens {
    add: map<address, FeeToken>; // token -> config
    remove: cell; // vector<address>
}

// NOTE: we just merged this into UpdateFeeTokens
// struct (0x10000003) UpdatePremiumMultiplierWeiPerEth { // token, multiplier }

// crc32('FeeQuoter_UpdateTokenTransferFeeConfigs')
struct (0xB2826316) FeeQuoter_UpdateTokenTransferFeeConfigs {
    // TODO: would these be more efficient as snakedata (key, value)?
    updates: map<uint64, UpdateTokenTransferFeeConfig>; // destChainSelector -> updates
}

struct UpdateTokenTransferFeeConfig {
    add: map<address, TokenTransferFeeConfig>; // token address -> config
    remove: cell; // vector<address>
}

// crc32('FeeQuoter_UpdateDestChainConfig')
struct (0x29950BAA) FeeQuoter_UpdateDestChainConfigs {
    updates: cell; // vec<FeeQuoter_UpdateDestChainConfig>
}

struct FeeQuoter_UpdateDestChainConfig {
    destChainSelector: uint64;
    destChainConfig: FeeQuoterDestChainConfig;
}

// Out messages

// crc32('FeeQuoter_MessageValidated')
struct (0x1FA60374) FeeQuoter_MessageValidated<C> {
    msg: Cell<CCIPSend>
    metadata: Cell<C>
    fee: coins
}
