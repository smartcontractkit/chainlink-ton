import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../deployable/types.tolk";
import "utils.tolk";
import "../lib/utils.tolk";

struct Storage {
    ownable: Ownable2Step;
    deployer: cell; // Deployable compiled code
    feeQuoter: address;

    // TODO: embed ocr3 base state

    // static config
    chainSelector: uint64;
    // dynamic config
    permissionlessExecutionThresholdSeconds: uint32,

    // This is the OCR sequence number, not to be confused with the CCIP message sequence number.
    latestPriceSequenceNumber: uint64,
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

struct SkippedAlreadyExecuted {
    sourceChainSelector: uint64;
    sequenceNumber: uint64;
}

struct AlreadyAttempted {
    sourceChainSelector: uint64;
    sequenceNumber: uint64;
}

struct ExecutionStateChanged {
    sourceChainSelector: uint64;
    sequenceNumber: uint64;
    // TODO: are these not the same?
    messageId: uint256;
    messageHash: uint256;
    state: uint8;
}

// TODO: use sha256("CommitReportAccepted")
const CCIP_COMMIT_REPORT_ACCEPTED_TOPIC: int = 0x99; // for easier indexing

struct CommitReportAccepted {
    priceUpdates: Cell<PriceUpdates>?;
    blessedMerkleRoots: cell;
    unblessedMerkleRoots: cell;
}

struct SkippedReportExecution {
    sourceChainSelector: uint64;
}

struct RampMessageHeader { // 512
    messageId: uint256;
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    sequenceNumber: uint64;
    nonce: uint64;
}

struct Any2TONRampMessage {
    header: Cell<RampMessageHeader>;
    sender: cell;
    data: cell;
    receiver: address;
    gasLimit: coins; // TODO: does this make sense?
    tokenAmounts: cell; // vec<Any2TONTokenTransfer>
    // maybe mark these amounts as slice remaining then parse them by hand to avoid requiring this to be a map<> at send time?
}

struct Any2TONTokenTransfer {
    soucePoolAddress: cell;
    destPoolAddress: address;
    destGasAmount: uint32;
    extraData: cell;
    amount: uint256;
}

struct ExecutionReport {
    sourceChainSelector: uint64;
    message: Any2TONRampMessage;
    offchainTokenData: cell; // TODO: vec<vec<u8>>, one per token
    proofs: cell; // Proofs used to construct the merkle root TODO: vec<bytes32>
}

// Matches the EVM struct
struct CommitReport {
    priceUpdates: Cell<PriceUpdates>?; // Price updates for the fee_quoter
    blessedMerkleRoots: cell; // vec<MerkleRoot> Merkle roots that have been blessed by RMN
    unblessedMerkleRoots: cell; // vec<MerkleRoot> Merkle roots that don't require RMN blessing
    rmnSignatures: cell; //vec<bytes32>  The signatures for the blessed merkle roots
}

struct (0x00000001) Commit {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: cell;
    report: cell;
    signatures: cell;
}

struct (0x00000002) Execute {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: cell;
    report: cell;
}

type Msg = Commit | Execute;

fun onInternalMessage(msgCell: cell, msgBody: slice) {
    // TODO: does this waste gas?
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs     = msgCell.beginParse();
    val flags  = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { return; } // ignore all bounced messages
    val sender = cs.loadAddress();

    val msg = Msg.fromSlice(msgBody);
    match (msg) {
        Commit => { commit(msg, sender) }
        Execute => { _execute(msg, sender) }
    }
}

@pure @inline
fun getMerkleRootID(merkleRoot: uint256): builder {
    return beginCell() // id:u16 = 2 | merkleRoot:256
        .storeUint(2, 16) // TODO: alias constant for MerkleRoot
        .storeUint(merkleRoot, 256);
}

fun commit(msg: Commit, sender: address) {
    val st = Storage.load();

    // ocr3 base: validate signatures
    // NOTE: we always want to calculate cell_hash(report) when validating

    // parse report
    val report = CommitReport.fromCell(msg.report);

    // TODO: verify RMN signatures on blessed roots

    // update token/gas prices if any
    if (report.priceUpdates != null) {
        val updatePricesMsg = createMessage({
            bounce: true, // TODO:
            value: ton("0.05"), // TODO:
            dest: st.feeQuoter,
            body: report.priceUpdates!.load(),
        });
        updatePricesMsg.send(SEND_MODE_REGULAR);
    }

    // TODO: assert cells are well-formed
    var roots = Iterator<MerkleRoot>.new(report.unblessedMerkleRoots);
    // TODO: also iterate over blessed roots

    while (!roots.empty()) {
        val root = roots.next();

        // initialize MerkleRoot subcontract
        val initMsg = createMessage({
            bounce: true, // TODO: could bounce if root already exists
            value: ton("0.1"), // TODO:
            dest: {
                stateInit: {
                    code: st.deployer,
                    data: Deployable {
                        owner: contract.getAddress(),
                        id: getMerkleRootID(root.merkleRoot),
                    }.toCell(),
                },
                // TODO: toShard so it's collocated with offramp
            },
            // TODO:
            // body: Initialize {
            //     stateInit: {
            //         code: st.destChainConfigCode,
            //         data: DestChainConfig_Storage {
            //         }.toCell(),
            //     }
            // },
        });
        initMsg.send(SEND_MODE_REGULAR);
    }

    emit(CCIP_COMMIT_REPORT_ACCEPTED_TOPIC, CommitReportAccepted {
        priceUpdates: report.priceUpdates,
        blessedMerkleRoots: report.blessedMerkleRoots,
        unblessedMerkleRoots: report.unblessedMerkleRoots,
    })
}

fun _execute(msg: Execute, sender: address) {
    val st = Storage.load();

    // ocr3 base: validate execute report

    // parse report
    val report = ExecutionReport.fromCell(msg.report);

    // calculate merkle root
    // send message to MerkleRoot (execute)
}

// TODO: handle signals from MerkleRoot (release tokens, execute)
// maybe send these straight to router if router can validate address == deployable(offrampAddress, MerkleRoot, id)
// the payload would need the id & chainSelector so we can calculate/validate offrampAddress & that the merkle root is allowed to send for that ID
// NOTE: this assumes router has a well known, static address. So two stage deployment: put up router, then compile the addr into contracts
// (or init contract state with that router addr? probably what solana does)

get typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OffRamp", "1.0.0");
 }
