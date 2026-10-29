import "../../lib/utils"

const FeeQuoter_FACILITY_NAME = "link.chain.ton.ccip.FeeQuoter";
const FeeQuoter_FACILITY_ID = FeeQuoter_FACILITY_NAME.crc32() % 640 + 10;  // 344
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

struct TimestampedPrice {
    value: uint224;
    timestamp: uint32;
}

struct PriceUpdates {
    tokenPriceUpdates: SnakedCell<TokenPriceUpdate>;
    gasPriceUpdates: SnakedCell<GasPriceUpdate>;
}

struct TokenPriceUpdate {
    sourceToken: address; // This is the local token
    usdPerToken: uint224;
}

struct GasPriceUpdate {
    destChainSelector: uint64;
    executionGasPrice: uint112;
    dataAvailabilityGasPrice: uint112;
}

struct FeeQuoterDestChainConfig {
    isEnabled: bool;
    maxNumberOfTokensPerMsg: uint16;
    maxDataBytes: uint32;
    maxPerMsgGasLimit: uint32;
    destGasOverhead: uint32;
    destGasPerPayloadByteBase: uint8;
    destGasPerPayloadByteHigh: uint8;
    destGasPerPayloadByteThreshold: uint16;
    destDataAvailabilityOverheadGas: uint32;
    destGasPerDataAvailabilityByte: uint16;
    destDataAvailabilityMultiplierBps: uint16;

    chainFamilySelector: uint32; // 4 bytes

    defaultTokenFeeUsdCents: uint16;
    defaultTokenDestGasOverhead: uint32;
    defaultTxGasLimit: uint32;

    // Multiplier for gas costs, 1e18 based so 11e17 = 10% extra cost.
    gasMultiplierWeiPerEth: uint64;
    gasPriceStalenessThreshold: uint32;
    networkFeeUsdCents: uint32;
}

struct GasPrice {
    executionGasPrice: uint112;
    dataAvailabilityGasPrice: uint112;
    timestamp: uint64;
}

struct TokenTransferFeeConfig {
    isEnabled: bool;
    minFeeUsdCents: uint32;
    maxFeeUsdCents: uint32;
    deciBps: uint16;
    destGasOverhead: uint32;
    destBytesOverhead: uint32;
}

struct FeeQuoter_DestOverhead {
    destGasOverhead: uint32;
    destBytesOverhead: uint32;
}

const VAL_1E5:  uint256 = 100000;
const VAL_1E14: uint256 = 100000000000000;
const VAL_1E16: uint256 = 10000000000000000;
const VAL_1E18: uint256 = 1000000000000000000;


// This represents FeeQuoter's DestChainConfig (not OnRamp)
struct DestChainConfig {
    config: FeeQuoterDestChainConfig;

    usdPerUnitGas: Cell<GasPrice>;

    tokenTransferFeeConfigs: map<address, TokenTransferFeeConfig> = [];
}

struct UpdateTokenTransferFeeConfig {
    add: map<address, TokenTransferFeeConfig> = []; // token address -> config
    remove: SnakedCell<address>;
}

struct FeeToken {
    premiumMultiplierWeiPerEth: uint64
}

struct FeeQuoter_UpdateDestChainConfig {
    destChainSelector: uint64;
    destChainConfig: FeeQuoterDestChainConfig;
}

struct Fee {
    feeTokenAmount: coins; // fee value in fee token
    feeValueJuels: uint96; // fee value in juels
}