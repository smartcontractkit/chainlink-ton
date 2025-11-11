import "../common/types"
import "../fee_quoter/types"
import "../../lib/utils"
import "../router/messages"
import "../fee_quoter/messages"

struct ExecutionReport {
    sourceChainSelector: uint64;
    messages: cell; // vec<Any2TVMRampMessage>
    offchainTokenData: cell; // TODO: vec<vec<u8>>, one per token
    proofs: cell; // Proofs used to construct the merkle root TODO: vec<bytes32>
    proofFlagBits: uint256;
}

// Matches the EVM struct
struct CommitReport {
    priceUpdates: Cell<PriceUpdates>?; // Price updates for the fee_quoter
    merkleRoots: SnakedCell<MerkleRoot>; // Merkle roots 
}

struct MessageMetadata {
    _header: uint256 = stringSha256("Any2TVMMessageHashV1");
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    onRamp: Cell<CrossChainAddress>;
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
            .storeCoins(self.gasLimit)
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

struct MerkleRoot {
    sourceChainSelector: uint64;
    onRampAddress: CrossChainAddress;
    minSeqNr: uint64;
    maxSeqNr: uint64;
    merkleRoot: uint256;
}

struct Any2TVMTokenTransfer {
    sourcePoolAddress: Cell<CrossChainAddress>;
    destPoolAddress: address;
    destGasAmount: uint32;
    extraData: cell;
    amount: uint256;
}

struct OffRamp_Deployables {
    router: address;
    deployer: cell; // Deployable compiled code
    merkleRootCode: cell; // use a library cell offchain to save space
    receiveExecutorCode: cell; // use a library cell offchain to save space 
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
enum ExecutionState: uint8 { // TODO: compress to uint2?
    Untouched = 0
    InProgress = 1
    Success = 2
    Failure = 3
}

const AMOUNT_FOR_MERKLE_ROOT_DEPLOYMENT = ton("0.02");
const AMOUNT_FOR_RECEIVE_EXECUTOR_DEPLOYMENT = ton("0.01");

struct OffRamp_Costs{}
struct MerkleRoot_Costs{}
struct ReceiveExecutor_Costs{}

fun MerkleRoot_Costs.validate(isManualExec: bool){
    val baseFee = ton("0.005"); // validateFees
    return baseFee + OffRamp_Costs.executeValidated(isManualExec);
}

fun OffRamp_Costs.executeValidated(isManualExec: bool){
    val baseFee = ton("0.015");
    if (!isManualExec) {
        return baseFee + AMOUNT_FOR_RECEIVE_EXECUTOR_DEPLOYMENT + ReceiveExecutor_Costs.initExec();
    } else {
        return baseFee + ReceiveExecutor_Costs.initExec();
    }
}

fun ReceiveExecutor_Costs.initExec(){
    val baseFee = ton("0.004");
    return baseFee + OffRamp_Costs.dispatchValidated();
}

fun OffRamp_Costs.dispatchValidated(){
    val baseFee = ton("0.005");
    return baseFee + Router_Costs.routeMessage();
}

fun OffRamp_Costs.receiveConfirmOrDeny() {
    val baseFee = ton("0.004");
    return baseFee + ReceiveExecutor_Costs.confirmedOrBounced();
}

fun OffRamp_Costs.notify() {
    val baseFee = ton("0.004");
    return baseFee + MerkleRoot_Costs.markState();
}

fun MerkleRoot_Costs.markState() {
    return ton("0.003");
}

fun ReceiveExecutor_Costs.confirmedOrBounced() {
    val baseFee = ton("0.004");
    return baseFee + OffRamp_Costs.notify();
}

fun OffRamp_Costs.commit(priceUpdatesOnlyReport: bool) {
    val baseFee = ton("0.015");
    if (priceUpdatesOnlyReport) {
        return baseFee + FeeQuoter_Costs.updatePrices();
    } else {
        val totalAmountForRoot = AMOUNT_FOR_MERKLE_ROOT_DEPLOYMENT;
        return baseFee + FeeQuoter_Costs.updatePrices() + totalAmountForRoot;
    }
}

fun OffRamp_Costs.execute(isManualExec: bool) {
    val baseFee = ton("0.0125");
    return baseFee + MerkleRoot_Costs.validate(isManualExec);
}

