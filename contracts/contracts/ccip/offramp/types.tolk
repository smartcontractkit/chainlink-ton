// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"
import "../common/types"
import "../fee_quoter/types"
import "errors"

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

struct GasOverride {
    receiverExecutionGasLimit: coins? = null;
    tokenGasOverrides: SnakedCell<coins>? = null
}

// getEffectiveDestGasAmount returns the gas amount to use for token transfer
//
// @note: We currently only support a single token transfer
//
// If the gasOverride is null or its tokenGasOverrides is null, or its tokenGasOverrides is zero,
// it returns the sum of destGasAmount from all token transfers in the message.
// Otherwise, it returns the tokenGasOverride
//
// @note from evm: 
//
// The gas limit can not be lowered as that could cause the message to fail. If manual execution is done
// from an UNTOUCHED state and we would allow lower gas limit, anyone could grief by executing the message with
// lower gas limit than the DON would have used. This results in the message being marked FAILURE and the DON
// would not attempt it with the correct gas limit.
fun GasOverride?.getEffectiveDestGasAmount(self, tokenTransfer: Any2TVMTokenTransfer): coins? {
    if (self != null && self.tokenGasOverrides != null) {
        val tokenGasOverride = self.tokenGasOverrides.asSingle().unwrap(OffRamp_Error.ManualExecutionGasAmountCountMismatch);
        if (tokenGasOverride != 0) {
            assert (tokenGasOverride >= tokenTransfer.destGasAmount) throw OffRamp_Error.InvalidManualExecutionGasLimit;
            return tokenGasOverride;
        }
    }
    return tokenTransfer.destGasAmount;
}

// getEffectiveGasLimit returns the total gas amount to use for message execution
//
// If the gasOverride is not null and its receiverExecutionGasLimit is not null or zero,
// it returns its receiverExecutionGasLimit.
// Otherwise, it returns gasLimit from the message, passed as an argument.
// It throws if receiverExecutionGasLimit is less than the gasLimit from the message
fun GasOverride?.getEffectiveGasLimit(self, gasLimit: coins): coins {
    if (self != null && self.receiverExecutionGasLimit != null && self.receiverExecutionGasLimit != 0) {
        assert (self.receiverExecutionGasLimit >= gasLimit) throw OffRamp_Error.InvalidManualExecutionGasLimit;
        return self.receiverExecutionGasLimit;
    }
    return gasLimit;
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

// Helper to extract the single item from a SnakedCell, and assert that there is only one
fun SnakedCell<T>.asSingle(self): T? {
    var it = self.iter();
    if (it.empty()) {
        return null;
    }
    val token = it.next();
    if (!it.empty()) {
        return null;
    }
    return token
}

fun T?.unwrap(self, error: int): T {
    if (self == null) {
        throw error;
    }
    return self;
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
    destGasAmount: coins;
    // Data from the source pool to be passed to the destination pool.
    extraData: cell?;
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
