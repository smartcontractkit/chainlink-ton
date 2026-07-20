// SPDX-License-Identifier: BUSL-1.1
import "../common/types"
import "../fee_quoter/types"
import "../../lib/utils"

const OffRamp_FACILITY_NAME = "link.chain.ton.ccip.OffRamp";
const OffRamp_FACILITY_ID = OffRamp_FACILITY_NAME.crc32() % 640 + 10;  // 221
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

struct ExecutionReport {
    sourceChainSelector: uint64;
    messages: cell; // single Any2TVMRampMessage, though interface is set up to possibly support vec<Any2TVMRampMessage> in the future
    offchainTokenData: cell; // vec<vec<u8>>, one per token, we don't support token transfers right now, so this is ignored
    proofs: SnakedCell<uint256>; // Proofs used to construct the merkle root as vec<uint256>
    proofFlagBits: uint256;
}

// Matches the EVM struct
struct CommitReport {
    priceUpdates: Cell<PriceUpdates>? = null; // Price updates for the fee_quoter
    merkleRoots: SnakedCell<MerkleRoot>; // Merkle roots is always size one, but interface is set up to possibly support multiple in the future
}

struct Any2TVMMessageV1Metadata {
    _header: uint256 = "Any2TVMMessageHashV1".sha256();
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    onRamp: Cell<CrossChainAddress>;
}

struct DeployableHashes {
    merkleRoot: uint256;
    receiveExecutor: uint256;
    deployer: uint256;
}

struct Config {
    // -- Static config
    chainSelector: uint64
    // gasForCallExactCheck
    // rmnRemote
    // nonceManager
    // tokenAdminRegistry
    // -- Dynamic config
    feeQuoter: address
    permissionlessExecutionThresholdSeconds: uint32
    // isRMNVerificationDisabled
    // messageInterceptor
}

struct SourceChainConfig {
    router: address;
    isEnabled: bool;
    minSeqNr: uint64;
    isRMNVerificationDisabled: bool;
    onRamp: CrossChainAddress;
}

struct Any2TVMRampMessage {
    header: RampMessageHeader;
    sender: Cell<CrossChainAddress>;
    data: cell;
    receiver: address;
    gasLimit: coins;
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?;
    // maybe mark these amounts as slice remaining then parse them by hand to avoid requiring this to be a map<> at send time?
}

// Helper to extract the single token transfer from the message, and assert that there is only one token transfer
fun SnakedCell<Any2TVMTokenTransfer>.getTokenTransfer(self, error: int): Any2TVMTokenTransfer {
    var it = self.iter();
    assert (!it.empty(), error);
    val token = it.next();
    assert (it.empty(), error);
    return token
}

fun Any2TVMRampMessage.generateMessageId(self, metadataHash: uint256): uint256 {
    // Loosely based on https://github.com/smartcontractkit/chainlink-ccip/blob/2d2ce6abb3f7626dbd3008e4232da4faa839feff/chains/evm/contracts/libraries/Internal.sol#L113-L134
    return Any2TVMRampMessageIDData{
        metadataHash,
        metadata: Any2TVMRampMessageIDHeader {
            messageId: self.header.messageId,
            receiver: self.receiver,
            sequenceNumber: self.header.sequenceNumber,
            gasLimit: self.gasLimit,
            nonce: self.header.nonce,
        }.toCell(),
        sender: self.sender,
        data: self.data,
        tokenAmounts: self.tokenAmounts
    }.toCell().hash();
}


struct Any2TVMRampMessageIDData {
    _leafDomainSeparator: bits256 = LEAF_DOMAIN_SEPARATOR;
    metadataHash: uint256;
    metadata: Cell<Any2TVMRampMessageIDHeader>;
    sender: Cell<CrossChainAddress>;
    data: cell;
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?
}

struct Any2TVMRampMessageIDHeader {
    messageId: uint256;
    receiver: address;
    sequenceNumber: uint64;
    gasLimit: coins;
    nonce: uint64;
}

struct MerkleRoot {
    sourceChainSelector: uint64;
    onRampAddress: CrossChainAddress;
    minSeqNr: uint64;
    maxSeqNr: uint64;
    merkleRoot: uint256;
}

struct Any2TVMTokenTransfer {
    sourcePoolAddress: Cell<CrossChainAddress>;
    token: address;
    destGasAmount: uint32; // TBD: This field was removed in CCIP 2.0 and it's purpose/utility in TON is unclear.
    extraData: cell;
    // amount of transfered tokens in source chain decimals
    amount: uint256;
}

struct OffRamp_Deployables {
    rmnRouter: address;
    deployer: cell; // Deployable stub contract compiled code
    merkleRootCode: cell; // MerkleRoot contract compiled code 
    receiveExecutorCode: cell; // ReceiveExecutor contract compiled code
}


const MERKLE_ROOT_ID_SIZE = 256;
const RECEIVE_EXECUTOR_ID_SIZE = 192;

type ReceiveExecutorId = uint192;
type MerkleRootId = uint256;

fun ReceiveExecutorId.getSourceChainSelector(self): uint64 {
    var cs = beginCell().storeUint(self, RECEIVE_EXECUTOR_ID_SIZE).endCell().beginParse();
    return cs.loadUint(64);
}

// These have to match the EVM states
enum ExecutionState: uint8 {
    Untouched = 0
    InProgress = 1
    Success = 2
    Failure = 3
}

const AMOUNT_FOR_MERKLE_ROOT_DEPLOYMENT = ton("0.02");
const AMOUNT_FOR_RECEIVE_EXECUTOR_DEPLOYMENT = ton("0.01");
