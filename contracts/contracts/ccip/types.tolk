import "utils.tolk";

struct MerkleRoot {
    sourceChainSelector: uint64;
    onRampAddress: bytes64; // TODO: this needed to be fixed size for iteration
    minSeqNr: uint64;
    maxSeqNr: uint64;
    merkleRoot: uint256;
}

// Router
 
struct TokenAmount {
    amount: uint256;
    token: address;
}

struct (0x10000001) SetRamp {
    queryId: uint64;
    // TODO: support onramp and offramp, support list
    destChainSelector: uint64;
    onRamp: address;
}

struct (0x00000001) CCIPSend {
    queryId: uint64;
    destChainSelector: uint64;
    receiver: cell; // bytes32?
    data: cell;
    tokenAmounts: cell; // vec<tokenAmount>
    feeToken: address;
    extraArgs: cell;
}

struct (0x7362d09c) JettonTransferNotification {
    queryId: uint64;
    amount: coins;
    sender: address;
    forwardPayload: Cell<CCIPSend>?; // could also be RemainingBitsAndRefs
}

// OnRamp
struct (0x00000002) OnRampSend {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<CCIPSend>;
    caller: address;
    // TODO: metadata { caller, value, tokenAmounts }
}

struct SetDynamicConfig {}

struct UpdateDestChainConfigs {}

struct UpdateAllowlist {}

struct WithdrawFeeTokens {}

// FeeQuoter

struct TimestampedPrice {
    value: uint224;
    timestamp: uint64;
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
    usdPerUnitGas: uint224;
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
    destDataAvailabilityMultiplierBps: uint32;

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

// This represents FeeQuoter's DestChainConfig (not OnRamp)
struct DestChainConfig_Storage {
    owner: address;

    config: FeeQuoterDestChainConfig;

    usdPerUnitGas: Cell<GasPrice>; // TODO: it'd be nice if this wasn't split off

    tokenTransferFeeConfigs: Map<TokenTransferFeeConfig>; // (sdict) address -> TokenTransferFeeConfig
}

struct TokenTransferFeeConfig {
    isEnabled: bool;
    minFeeUsdCents: uint32;
    maxFeeUsdCents: uint32;
    deciBps: uint16;
    destGasOverhead: uint32;
    destBytesOverhead: uint32;
}


struct (0x10000001) UpdatePrices {
    updates: PriceUpdates    
}

struct (0x10000002) UpdateFeeTokens {
    // add
    // remove
}
struct (0x10000003) UpdatePremiumMultiplierWeiPerEth {
    // token, multiplier
}

struct (0x10000004) UpdateTokenTransferFeeConfigs {
    // add
    // remove
}

struct (0x10000005) UpdateDestChainConfig {
    destChainSelector: uint64;
    destChainConfig: FeeQuoterDestChainConfig;
}

struct (0x10000006) GetValidatedFee {
    msg: CCIPSend
}

// OffRamp

struct MerkleRoot_Storage {
    owner: address;
    state: uint8;
    report: Cell<MerkleRoot>;
    states: uint256;          // modeled as a bytemap, so we can batch up to 32 executions
    executionStates: uint256; // modeled as a bytemap, so we can batch up to 32 executions

    tokenBalances: UMap<uint64, Map<TokenBalance>>; // seqNum -> tokenAddress -> (amount: coins, failed: bool)
    // if any amount has failed = true, allows re-executing and will only transfer remaining
}

struct TokenBalance {
    amount: coins;
    failed: bool; // if marked as failed, a retry will allow re-sending these
}

struct (0x10000010) ExecuteReport {
}

// Errors

const ERROR_UNKNOWN_DEST_CHAIN_SELECTOR: int = 0x1;
const ERROR_DEST_CHAIN_NOT_ENABLED: int = 0x2;
const ERROR_FEE_TOKEN_NOT_SUPPORTED: int = 0x3;
const ERROR_STALE_GAS_PRICE: int = 0x4;
const ERROR_INVALID_MSG_DATA: int = 0x5;
const ERROR_SENDER_NOT_ALLOWED: int = 0x6;
