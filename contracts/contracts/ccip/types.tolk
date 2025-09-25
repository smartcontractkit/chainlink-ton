import "../lib/utils.tolk";

const ERROR_OUT_OF_RANGE = 5;

// 1-byte length prefixed byte slice (up to 64 bytes)
// Almost all uses need to Cell<> box this type because it can be sized up to 8+512 bits
type CrossChainAddress = slice;

fun CrossChainAddress.packToBuilder(self, mutate b: builder) {
    val nBits = self.remainingBitsCount();
    assert(nBits % 8 == 0, ERROR_OUT_OF_RANGE);
    val nBytes = nBits / 8;
    assert(nBytes <= 64, ERROR_OUT_OF_RANGE);
    b.storeUint(nBytes, 8);
    b.storeSlice(self);
}

fun CrossChainAddress.unpackFromSlice(mutate s: slice) {
    val nBytes= s.loadUint(8);
    assert(nBytes <= 64, ERROR_OUT_OF_RANGE);
    return s.loadBits(nBytes * 8);
}

struct MerkleRoot {
    sourceChainSelector: uint64;
    onRampAddress: CrossChainAddress;
    minSeqNr: uint64;
    maxSeqNr: uint64;
    merkleRoot: uint256;
}

struct RampMessageHeader { // 512
    messageId: uint256;
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    sequenceNumber: uint64;
    nonce: uint64;
}

struct Any2TVMRampMessage {
    header: RampMessageHeader;
    sender: Cell<CrossChainAddress>;
    data: cell;
    receiver: address;
    // gasLimit: coins;
    tokenAmounts: cell?; // vec<Any2TVMTokenTransfer>
    // maybe mark these amounts as slice remaining then parse them by hand to avoid requiring this to be a map<> at send time?
}

struct Any2TVMMessage {
    messageId: uint256,
    sourceChainSelector: uint64,
    sender: CrossChainAddress,
    data: cell
}


struct Any2TVMTokenTransfer {
    sourcePoolAddress: Cell<CrossChainAddress>;
    destPoolAddress: address;
    destGasAmount: uint32;
    extraData: cell;
    amount: uint256;
}

struct TVM2AnyRampMessage {
    header: RampMessageHeader;
    sender: address;
    body: Cell<TVM2AnyRampMessageBody>;
    feeValueJuels: uint96; // entire supply of LINK always fits into u96
}

struct TVM2AnyRampMessageBody {
    receiver: Cell<CrossChainAddress>;
    data: cell;
    extraArgs: cell;
    tokenAmounts: cell;
    feeToken: address;
    feeTokenAmount: uint256;
}

const LEAF_DOMAIN_SEPARATOR: slice = stringHexToSlice("0000000000000000000000000000000000000000000000000000000000000000");

fun Any2TVMRampMessage.generateMessageId(self, metadataHash: uint256): uint256 {
    // Loosely based on https://github.com/smartcontractkit/chainlink-ccip/blob/2d2ce6abb3f7626dbd3008e4232da4faa839feff/chains/evm/contracts/libraries/Internal.sol#L113-L134
        return beginCell()
        .storeSlice(LEAF_DOMAIN_SEPARATOR)
        .storeUint(metadataHash, 256)
        // header
        .storeRef(
            beginCell()
            .storeUint(self.header.messageId, 256)
            .storeAddress(self.receiver)
            .storeUint(self.header.sequenceNumber, 64)
            // .storeCoins(self.gasLimit)
            .storeUint(self.header.nonce, 64)
            .endCell()
        )
        // message
        .storeRef(self.sender)
        .storeRef(self.data)
        .storeMaybeRef(self.tokenAmounts)
        .endCell()
        .hash()
}

fun TVM2AnyRampMessage.generateMessageId(self, metadataHash: uint256): uint256 {
    // Loosely based on https://github.com/smartcontractkit/chainlink/blob/d1a9f8be2f222ea30bdf7182aaa6428bfa605cf7/contracts/src/v0.8/ccip/libraries/Internal.sol#L137-L154
    return beginCell()
        .storeSlice(LEAF_DOMAIN_SEPARATOR)
        .storeUint(metadataHash, 256)
        // header
        .storeAddress(self.sender)
        .storeUint(self.header.sequenceNumber, 64)
        .storeUint(self.header.nonce, 64)
        // message
        .storeRef(self.body) // receiver, data, extraArgs, tokenAmounts, feeToken (addr, amount) NOTE: feeValueJuels deliberately excluded
        .endCell()
        .hash()
}

// Router
 
struct TokenAmount {
    amount: coins;
    token: address;
}

struct (0x10000001) SetRamp {
    queryId: uint64;
    // TODO: support onramp and offramp, support list
    destChainSelector: uint64;
    onRamp: address;
}

// TODO should separate CCIPSend msg (with opcode) from CCIPSend data

struct (0x00000001) CCIPSend {
    queryId: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: cell; // vec<tokenAmount>
    feeToken: address;
    extraArgs: cell;
}

struct (0x7362d09c) JettonTransferNotification {
    queryId: uint64;
    amount: coins;
    sender: address;
    forwardPayload: cell?; // could also be RemainingBitsAndRefs
}

// OnRamp
struct (0x10000002) OnRampSend {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<CCIPSend>;
    metadata: Metadata
}

struct OnRampDynamicConfig {
    feeQuoter: address;
    // destination address that will receive tokens on withdrawFees
    feeAggregator: address;
    allowlistAdmin: address;
}

// crc32('OnRamp_WithdrawJettons')
struct (0x266AEACF) OnRamp_WithdrawJettons {
    msgId: uint224,
    tokens: cell; // vec<TokenAmount>
    onrampJettonWallet: address;
}

struct (0x10000003) SetDynamicConfig {
    config: OnRampDynamicConfig
}

struct OnRampUpdateDestChainConfig {
    destChainSelector: uint64;
    router: address;
    allowlistEnabled: bool;
}

// crc32('OnRamp_ExecutorFinishedSuccessfully')
struct (0xCFA6B336) OnRamp_ExecutorFinishedSuccessfully {
    msgId: uint224,
    msg: Cell<CCIPSend>
    metadata: Metadata
    fee: coins
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000004) OnRampUpdateDestChainConfigs {
    updates: cell; // vec<OffRampUpdateDestChainConfig>
}

struct UpdateAllowlist {
    destChainSelector: uint64;
    add: cell; // vec<address>
    remove: cell; // vec<address>
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000005) UpdateAllowlists {
    updates: cell; // vec<UpdateAllowlist>
}

struct WithdrawFeeTokens {}

// FeeQuoter

struct TimestampedPrice {
    value: uint224;
    timestamp: uint64; // TODO: size down to uint32, was a mistake when porting
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

struct Metadata {
    sender: address,
    // TODO: metadata { value, tokenAmounts }
}

struct MessageMetadata {
    header: uint256 = stringSha256("Any2TVMMessageHashV1");
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    onRamp :Cell<CrossChainAddress>;
}


// OffRamp

struct MerkleRoot_Storage {
    rootId: uint224;
    owner: address;
    state: uint8;
    executionState: uint8; 
    tokenBalance: TokenBalance;
    message: Cell<Any2TVMRampMessage>? = null;
}

//crc32('MerkleRoot_Validate')
struct (0x38ede91) MerkleRoot_Validate {
    message: Any2TVMRampMessage,
    //TODO: token data
}

//crc32('MerkleRoot_CCIPReceiveConfirm')
struct (0x81650c13) MerkleRoot_CCIPReceiveConfirm {
    receiver: address
}

//crc32('MerkleRoot_CCIPReceiveBounced')
struct(0x845e303f) MerkleRoot_CCIPReceiveBounced {
    receiver: address
}


//Must be sent from an owned MerkleRoot contract
//crc32('OffRamp_DispatchValidated')
struct (0x58cfcb02) OffRamp_DispatchValidated { 
    message: Cell<Any2TVMRampMessage>;
    rootId: uint224;
}

//crc32('Receiver_CCIPReceive')
struct (0xb3126df1) CCIPReceive {
    rootId: uint224; // to calculate where to send CCIPReceiveConfirm and CCIPReceiveFailed
    message: Any2TVMMessage;
}

//crc32('OffRamp_CCIPReceiveConfirm')
struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
    rootId: uint224;
}

//crc32('OffRamp_NotifySuccess')
struct (0x23232323) OffRamp_NotifySuccess {
    header: RampMessageHeader;
    rootId: uint224;
}

//crc32('OffRamp_NotifyFailure')
struct(0x177ebd03) OffRamp_NotifyFailure {
    header: RampMessageHeader;
    rootId: uint224;
}

//crc32('OffRamp_NotifyInProgress')
struct (0xdc81855a) OffRamp_NotifyInProgress {
    message: Any2TVMRampMessage; // vec<Any2TVMRampMessage>
    rootId: uint224;
}

struct TokenBalance {
    amount: coins = 0;
    failed: bool = false; // if marked as failed, a retry will allow re-sending these
}

struct (0x181dcf10) GenericExtraArgsV2 {
    gasLimit: uint256?;
    allowOutOfOrderExecution: bool;
}

struct (0x1f3b3aba) SVMExtraArgsV1 {
	computeUnits: uint32;
	accountIsWritableBitmap: uint64;
	allowOutOfOrderExecution: bool;
	tokenReceiver: uint256;
	accounts: cell; // vec<slice>
}

// Errors

const ERROR_UNKNOWN_DEST_CHAIN_SELECTOR: int = 256;
const ERROR_DEST_CHAIN_NOT_ENABLED: int = 257;
const ERROR_FEE_TOKEN_NOT_SUPPORTED: int = 258;
const ERROR_STALE_GAS_PRICE: int = 259;
const ERROR_INVALID_MSG_DATA: int = 260;
const ERROR_SENDER_NOT_ALLOWED: int = 261;
const ERROR_INVALID_MESSAGE_DEST_CHAIN_SELECTOR: int = 262;
const ERROR_SOURCE_CHAIN_SELECTOR_MISMATCH: int = 263;
const ERROR_TOKEN_NOT_SUPPORTED: int = 264;
const ERROR_UNAUTHORIZED: int = 265;
const ERROR_SOURCE_CHAIN_NOT_ENABLED: int = 266;
const ERROR_EMPTY_EXECUTION_REPORT:int = 267;
const ERROR_DISPATCH_NOT_FROM_MERKLE_ROOT: int = 268;
const ERROR_INVALID_ON_RAMP_UPDATE: int = 269;
