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
struct (0x10000002) OnRampSend {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<CCIPSend>;
    caller: address;
    // TODO: metadata { caller, value, tokenAmounts }
}

struct OnRampDynamicConfig {
    feeQuoter: address;
    // destination address that will receive tokens on withdrawFees
    feeAggregator: address;
    allowlistAdmin: address;
}

struct (0x10000003) SetDynamicConfig {
    config: OnRampDynamicConfig
}

struct OnRampUpdateDestChainConfig {
    destChainSelector: uint64;
    router: address;
    allowlistEnabled: bool;
}

struct (0x10000004) OnRampUpdateDestChainConfigs {
    updates: cell; // vec<OrRampUpdateDestChainConfig>
}

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

struct TokenTransferFeeConfig {
    isEnabled: bool;
    minFeeUsdCents: uint32;
    maxFeeUsdCents: uint32;
    deciBps: uint16;
    destGasOverhead: uint32;
    destBytesOverhead: uint32;
}

struct (0x20000001) UpdatePrices {
    updates: PriceUpdates    
}

struct FeeToken {
    premiumMultiplierWeiPerEth: uint64
}

struct (0x20000002) UpdateFeeTokens {
    add: Map<FeeToken>; // token -> config
    remove: cell; // vector<address>
}

// NOTE: we just merged this into UpdateFeeTokens
// struct (0x10000003) UpdatePremiumMultiplierWeiPerEth { // token, multiplier }

struct (0x20000003) UpdateTokenTransferFeeConfigs {
    // TODO: would these be more efficient as snakedata (key, value)?
    updates: UMap<uint64, UpdateTokenTransferFeeConfig>; // destChainSelector -> updates
}

struct UpdateTokenTransferFeeConfig {
    add: Map<TokenTransferFeeConfig>; // token address -> config
    remove: cell; // vector<address>
} 

struct (0x20000004) UpdateDestChainConfig {
    destChainSelector: uint64;
    destChainConfig: FeeQuoterDestChainConfig;
}

struct (0x20000005) GetValidatedFee<C> {
    msg: Cell<CCIPSend>;
    metadata: Cell<C>,
}

struct Metadata {
    caller: address,
    // TODO: metadata { value, tokenAmounts }
}

struct (0x00000003) MessageValidated<C> {
    msg: Cell<CCIPSend>;
    metadata: Cell<C>,
    fee: uint256; // TODO: maybe coins?
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

const ERROR_UNKNOWN_DEST_CHAIN_SELECTOR: int = 256;
const ERROR_DEST_CHAIN_NOT_ENABLED: int = 257;
const ERROR_FEE_TOKEN_NOT_SUPPORTED: int = 258;
const ERROR_STALE_GAS_PRICE: int = 259;
const ERROR_INVALID_MSG_DATA: int = 260;
const ERROR_SENDER_NOT_ALLOWED: int = 261;
const ERROR_INVALID_MESSAGE_DEST_CHAIN_SELECTOR = 262;
const ERROR_SOURCE_CHAIN_SELECTOR_MISMATCH = 263;
const ERROR_TOKEN_NOT_SUPPORTED: int = 264;
