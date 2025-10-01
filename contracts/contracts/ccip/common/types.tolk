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



// OnRamp
// FeeQuoter

struct Metadata {
    sender: address,
    // TODO: metadata { value, tokenAmounts }
}


// OffRamp




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
