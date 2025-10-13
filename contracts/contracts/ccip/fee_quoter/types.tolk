struct TimestampedPrice {
    value: uint224;
    timestamp: uint32;
}

struct PriceUpdates {
    tokenPriceUpdates: cell; // vec<TokenPriceUpdate>
    gasPriceUpdates: cell; // vec<GasPriceUpdate>
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
    enforceOutOfOrder: bool;

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

const VAL_1E5:  uint256 = 100000;
const VAL_1E14: uint256 = 100000000000000;
const VAL_1E16: uint256 = 10000000000000000;
const VAL_1E18: uint256 = 1000000000000000000;

// TODO:
const TON_2_EVM_MESSAGE_FIXED_BYTES = 1;
const TON_2_EVM_MESSAGE_FIXED_BYTES_PER_TOKEN = 1;

const CCIP_LOCK_OR_BURN_V1_RET_BYTES = 32;

const CHAIN_FAMILY_SELECTOR_EVM:   uint32 = 0x2812d52c;
const CHAIN_FAMILY_SELECTOR_SVM:   uint32 = 0x1e10bdc4;
const CHAIN_FAMILY_SELECTOR_APTOS: uint32 = 0xac77ffec;
const CHAIN_FAMILY_SELECTOR_SUI:   uint32 = 0xc4e05953;


// This represents FeeQuoter's DestChainConfig (not OnRamp)
struct DestChainConfig {
    config: FeeQuoterDestChainConfig;

    // TODO: split this out since updates are more frequent?
    usdPerUnitGas: Cell<GasPrice>; // TODO: it'd be nice if this wasn't split off

    tokenTransferFeeConfigs: map<address, TokenTransferFeeConfig>;
}

// TBD this should live in a different file
const SUI_EXTRA_ARGS_MAX_RECEIVER_OBJECT_IDS = 64;
const SUI_MESSAGING_ACCOUNTS_OVERHEAD = 1;
const SUI_ACCOUNT_BYTE_SIZE: uint256 = 32;
/// @dev The expected static payload size of a token transfer when Borsh encoded and submitted to SUI.
/// TokenPool extra data and offchain data sizes are dynamic, and should be accounted for separately.
const SUI_TOKEN_TRANSFER_DATA_OVERHEAD: uint256 = (4 + 32) // source_pool
+ 32 // token_address
+ 4 // gas_amount
+ 4 // extra_data overhead
+ 32 // amount
+ 32 // size of the token lookup table account
+ 32 // token-related accounts in the lookup table, over-estimated to 32, typically between 11 - 13
+ 32 // token account belonging to the token receiver, e.g ATA, not included in the token lookup table
+ 32 // per-chain token pool config, not included in the token lookup table
+ 32; // per-chain token billing config, not always included in the token lookup table

struct UpdateTokenTransferFeeConfig {
    add: map<address, TokenTransferFeeConfig>; // token address -> config
    remove: cell; // vector<address>
}

struct FeeToken {
    premiumMultiplierWeiPerEth: uint64
}

struct FeeQuoter_UpdateDestChainConfig {
    destChainSelector: uint64;
    destChainConfig: FeeQuoterDestChainConfig;
}

