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

struct PriceUpdates {
    tokenPriceUpdates: cell; // vec<TokenPriceUpdate>
    gasPriceUpdates: cell; // vec<GasPriceUpdate>
}

struct TokenPriceUpdate {
    sourceToken: address; // This is the local token
    usdPerToken: uint256;
}

struct GasPriceUpdate {
    destChainSelector: uint64;
    usdPerUnitGas: uint256;
}

struct (0x10000001) GetValidatedFee {
    msg: CCIPSend
}
