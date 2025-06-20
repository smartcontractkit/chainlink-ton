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

struct (0x10000001) GetValidatedFee {
    msg: CCIPSend
}

// Errors


const ERROR_UNKNOWN_DEST_CHAIN_SELECTOR: int = 0x1;
const ERROR_DEST_CHAIN_NOT_ENABLED: int = 0x2;
const ERROR_FEE_TOKEN_NOT_SUPPORTED: int = 0x3;
const ERROR_STALE_GAS_PRICE: int = 0x4;
const ERROR_INVALID_MSG_DATA: int = 0x5;
