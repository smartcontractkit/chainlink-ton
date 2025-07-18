import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "./../lib/merkle_multi_proof/merkle_multi_proof.tolk"
import "../deployable/types.tolk";
import "../lib/utils.tolk";
import "../lib/ocr/multi_ocr3_base";
import "../lib/ocr/types";

struct Storage {
    ownable: Ownable2Step;
    deployer: cell; // Deployable compiled code
    merkleRootCode: cell; // make sure to use a library cell offchain to save space
    feeQuoter: address;
    ocr3Base: OCR3Base

    // static config
    chainSelector: uint64;
    // dynamic config
    permissionlessExecutionThresholdSeconds: uint32,

    // This is the OCR sequence number, not to be confused with the CCIP message sequence number.
    latestPriceSequenceNumber: uint64,
}

fun Storage.load(): Storage {
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
    header: RampMessageHeader;
    sender: cell;
    data: cell;
    receiver: address;
    // gasLimit: coins; // TODO: no gas limit because it's up to the receiver to pay for it's gas
    tokenAmounts: cell; // vec<Any2TONTokenTransfer>
    // maybe mark these amounts as slice remaining then parse them by hand to avoid requiring this to be a map<> at send time?
}

struct Any2TONTokenTransfer {
    sourcePoolAddress: cell;
    destPoolAddress: address;
    destGasAmount: uint32;
    extraData: cell;
    amount: uint256;
}

struct ExecutionReport {
    sourceChainSelector: uint64;
    messages: cell; // vec<Any2TONRampMessage>
    offchainTokenData: cell; // TODO: vec<vec<u8>>, one per token
    proofs: cell; // Proofs used to construct the merkle root TODO: vec<bytes32>
    proofFlagBits: uint256;
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
    reportContext: ReportContext;
    report: CommitReport;
    signatures: cell;
}

struct (0x00000002) Execute {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: ReportContext;
    report: ExecutionReport;
}

type Msg = Commit | Execute | OCR3Base_SetOCR3Config;

fun onInternalMessage(in:InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        Commit => { commit(msg, in.senderAddress) }
        Execute => { _execute(msg, in.senderAddress) }
        OCR3Base_SetOCR3Config => { _setOCR3Config(msg, in.senderAddress)}
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun _setOCR3Config(msg: OCR3Base_SetOCR3Config, sender: address) {
            var st = lazy Storage.load();
            st.ownable.requireOwner(sender);
            st.ocr3Base.setOcr3Config(msg);
            st.store();
}

@pure @inline
fun getMerkleRootID(merkleRoot: uint256): builder {
    return beginCell() // id:u16 = 2 | merkleRoot:256
        .storeUint(2, 16) // TODO: alias constant for MerkleRoot
        // TODO: include sourceChainSelector
        .storeUint(merkleRoot, 256);
}

fun commit(msg: Commit, sender: address) {
    var st = lazy Storage.load();

    // TODO: verify RMN signatures on blessed roots
    val report = msg.report;

    // update token/gas prices if any
    if (report.priceUpdates != null) {
        val updatePricesMsg = createMessage({
            bounce: true, // TODO:
            value: ton("0.05"), // TODO:
            dest: st.feeQuoter,
            body: UpdatePrices{
                updates: report.priceUpdates!.load()
            },
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
            body: Initialize {
                stateInit: {
                    code: st.merkleRootCode,
                    data: MerkleRoot_Storage {
                        owner: contract.getAddress(),
                        state: 0,
                        report: root.toCell(),
                        states: 0,
                        executionStates: 0,
                        tokenBalances: UMap<uint64, Map<TokenBalance>>.new(64),
                    }.toCell(),
                }
            },
        });
        initMsg.send(SEND_MODE_REGULAR);
    }

    // Verifies signatures and emits Transmitted event
    st.ocr3Base.transmit(
        sender,
        OCR_PLUGIN_TYPE_COMMIT,
        msg.reportContext,
        report.toCell(),
        msg.signatures
    );

    emit(CCIP_COMMIT_REPORT_ACCEPTED_TOPIC, CommitReportAccepted {
        priceUpdates: report.priceUpdates,
        blessedMerkleRoots: report.blessedMerkleRoots,
        unblessedMerkleRoots: report.unblessedMerkleRoots,
    })
}

fun _execute(msg: Execute, sender: address) {
    var st = lazy Storage.load();

    // ocr3 base: validate execute report

    // TODO: manual execution flag
    // TODO: check if chain was cursed by RMNRemote
    val report = msg.report;

    // TODO: if messages.empty() throw EMPTY_REPORT
    // if report.messages.len != offchainTokenData.len throw UNEXPECTED_TOKEN_DATA
    // ^- perhaps easier to validate by checking if offchainTokenData iter is still empty after the while loop

    var hashedLeaves = createEmptyTuple();

    // TODO: metadata hash:
    var messages = Iterator<Any2TONRampMessage>.new(report.messages);
    // TODO: is offchainTokenData not hashed?
    while (!messages.empty()) {
        val message = messages.next();

        // Commits do not verify the destChainSelector in the message since only the root is committed, so we
        // have to check it explicitly. This check is also important as we have assumed the metaDataHash above uses
        // the i_chainSelector as the destChainSelector.
        assert(message.header.destChainSelector == st.chainSelector, ERROR_INVALID_MESSAGE_DEST_CHAIN_SELECTOR);

        // If the message source chain selector does not match the report's source chain selector and the root has not
        // been committed for the report source chain selector this will be caught by the root verification.
        // This acts as an extra check to ensure the message source chain selector matches the report's source chain.
        assert(message.header.sourceChainSelector == report.sourceChainSelector, ERROR_SOURCE_CHAIN_SELECTOR_MISMATCH);

        // Hashes the cell data + refs recursively
        val hash = message.toCell().hash(); // TODO: mix together with metadata hash
        hashedLeaves.push(hash);
    }

    // calculate merkle root
    var leavesIterator = TupleIterator<uint256>.new(hashedLeaves);
    var proofsIterator = Iterator<uint256>.new(report.proofs);
    val root = merkleRoot(
        leavesIterator,
        proofsIterator,
        report.proofFlagBits,
    );

    // send message to MerkleRoot (execute)
    // val executeMsg = createMessage({
    //     bounce: true, // TODO: will bounce if root doesn't exist -> throw RootNotCommitted
    //     value: ton("0.1"), // TODO:
    //     dest: {
    //         stateInit: {
    //             code: st.deployer,
    //             data: Deployable {
    //                 owner: contract.getAddress(),
    //                 id: getMerkleRootID(root.merkleRoot),
    //             }.toCell(),
    //         },
    //         // TODO: toShard so it's collocated with offramp
    //     },
    //     // TODO:
    //     // body: Execute { },
    // });
    // executeMsg.send(SEND_MODE_REGULAR);

    // TODO: how do we handle incrementing the nonce? since execution is async this might take a while

    st.ocr3Base.transmit(
        sender,
        OCR_PLUGIN_TYPE_EXECUTE,
        msg.reportContext,
        msg.report.toCell(),
        beginCell().endCell(),
    );
}

// TODO: handle signals from MerkleRoot (release tokens, execute)
// maybe send these straight to router if router can validate address == deployable(offrampAddress, MerkleRoot, id)
// the payload would need the id & chainSelector so we can calculate/validate offrampAddress & that the merkle root is allowed to send for that ID
// NOTE: this assumes router has a well known, static address. So two stage deployment: put up router, then compile the addr into contracts
// (or init contract state with that router addr? probably what solana does)

// get fun executionState() {
//     // TODO: node will need to directly look at MerkleRoot subcontracts
// }

// get fun merkleRoot() {
//     // TODO: node will need to directly look at MerkleRoot subcontracts
// }

get fun latestPriceSequenceNumber() {
    
}

get fun staticConfig() {
    // chainSelector, gasForCallExactCheck?, rmnRemote, nonceManager, tokenAdminRegistry
}


fun setDynamicConfig() {
    
}

get fun dynamicConfig() {
    
}

get fun sourceChainConfig() {}

get fun allSourceChainConfigs(): tuple {
    return createEmptyTuple()
}

fun applySourceChainConfigUpdates() {}

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OffRamp", "1.0.0");
 }
