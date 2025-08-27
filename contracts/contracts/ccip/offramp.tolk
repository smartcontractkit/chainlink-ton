import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../lib/crypto/merkle_multi_proof.tolk"
import "../deployable/types.tolk";
import "../lib/utils.tolk";
import "../lib/ocr/multi_ocr3_base";
import "../lib/ocr/types";

struct Storage {
    id: uint32;
    ownable: Ownable2Step;
    deployer: cell; // Deployable compiled code
    merkleRootCode: cell; // make sure to use a library cell offchain to save space
    feeQuoter: address;
    ocr3Base: Cell<OCR3Base>

    // static config
    chainSelector: uint64;

    // dynamic config
    permissionlessExecutionThresholdSeconds: uint32,

    sourceChainConfigs: UMap<uint64, SourceChainConfig>;

    // This is the OCR sequence number, not to be confused with the CCIP message sequence number.
    latestPriceSequenceNumber: uint64;
}

struct SourceChainConfig {
    router: address;
    isEnabled: bool;
    minSeqNr: uint64;
    isRMNVerificationDisabled: bool;
    onRamp: CrossChainAddress;
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

const CCIP_COMMIT_REPORT_ACCEPTED_TOPIC: int = stringCrc32("CCIPCommitReportAccepted");

struct CommitReportAccepted {
    priceUpdates: Cell<PriceUpdates>?;
    merkleRoots: cell // vec<MerkleRoots>
}

struct SkippedReportExecution {
    sourceChainSelector: uint64;
}

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
    merkleRoots: cell; // vec<MerkleRoot> Merkle roots 
}

//crc32('OffRamp_Commit')
struct (0x9d431905) OffRamp_Commit {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: ReportContext;
    report: CommitReport;
    signatures: cell; //vec<SignatureEd25519>
}

//crc32('OffRamp_Execute')
struct (0x27bdac33) OffRamp_Execute {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: ReportContext;
    report: ExecutionReport;
}

//crc32('OffRamp_UpdateSourceChainConfig')
struct (0xb98c95e3) OffRamp_UpdateSourceChainConfig {
    queryId: uint64;
    sourceChainSelector: uint64;
    config: SourceChainConfig;
}

type OffRamp_InMessage = OffRamp_Commit | OffRamp_Execute | OffRamp_DispatchValidated | OffRamp_UpdateSourceChainConfig | OCR3Base_SetOCR3Config;

fun onInternalMessage(in:InMessage) {
    val msg = lazy OffRamp_InMessage.fromSlice(in.body);
    match(msg) {
        OffRamp_Commit => {
            commit(msg, in.senderAddress)
        }
        OffRamp_Execute => {
            _execute(msg, in.senderAddress)
        }
        OCR3Base_SetOCR3Config => { 
            _setOCR3Config(msg, in.senderAddress)
        }
        OffRamp_UpdateSourceChainConfig => {
            _updateSourceChainConfig(msg, in.senderAddress)
        }
        OffRamp_DispatchValidated => {
            _dispatchValidated(msg, in.senderAddress)
        } 
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// TODO: handle signals from MerkleRoot for releaseTokens
// maybe send these and MerkleRoot_Execute straight to router

// the payload would need the id & chainSelector so we can calculate/validate offrampAddress & that the merkle root is allowed to send for that ID
// NOTE: this assumes router has a well known, static address. So two stage deployment: put up router, then compile the addr into contracts
// (or init contract state with that router addr? probably what solana does)

//TODO: This function should relay to the router or the message should be received directly by the router
fun _dispatchValidated(msg: OffRamp_DispatchValidated, sender: address) {
            val st = Storage.load();

            // we don't store the addresses of the MerkleRoot contracts so we check the proof again and validate that the root contract was deployed by the OffRamp.
            // Here we assume just one message because we don't batch.

            // TODO: I am thinking it might be better to just remove all support for batching from on-chain, it can be easily added back later
            val message = Any2TVMRampMessage.fromCell(msg.messages);

            val root = message.generateMessageId(msg.metadataHash);

            val expectedAddress: AutoDeployAddress = {
                stateInit: {
                    code: st.deployer,
                    data: Deployable {
                        owner: contract.getAddress(),
                        id: getMerkleRootID(root),
                    }.toCell()
                }
            };

            assert(expectedAddress.addressMatches(sender)) throw ERROR_DISPATCH_NOT_FROM_MERKLE_ROOT;

            // dispatch message to receiver
            val ccipReceive: CCIPReceive = {
                message: {
                    messageId: message.header.messageId,
                    sourceChainSelector: message.header.sourceChainSelector,
                    sender: CrossChainAddress.fromCell(message.sender),
                    data: message.data
                }
            };

            val messageForReceiver = createMessage({
                bounce: true,
                value: ton("0.05"), // TODO: use the gas limit from the message
                dest: message.receiver,
                body: ccipReceive
            });
            messageForReceiver.send(SEND_MODE_REGULAR);
}

fun _setOCR3Config(msg: OCR3Base_SetOCR3Config, sender: address) {
        var st = lazy Storage.load();
        st.ownable.requireOwner(sender);

        var ocr3Base = st.ocr3Base.load();
        ocr3Base.setOcr3Config(msg);

        st.ocr3Base = ocr3Base.toCell();
        st.store();
}

@pure @inline
fun getMerkleRootID(merkleRoot: uint256): builder {
    return beginCell() // id:u16 = 1 | merkleRoot:256
        .storeUint(1, 16) // TODO: alias constant for MerkleRoot
        // TODO: include sourceChainSelector
        .storeUint(merkleRoot, 256);
}

fun commit(msg: OffRamp_Commit, sender: address) {
    var st = lazy Storage.load();

    val report = msg.report;

    // update token/gas prices if any
    if (report.priceUpdates != null) {
        val updatePricesMsg = createMessage({
            bounce: true,
            value: ton("0.05"), // TODO:
            dest: st.feeQuoter,
            body: UpdatePrices{
                updates: report.priceUpdates!.load()
            },
        });
        updatePricesMsg.send(SEND_MODE_REGULAR);
    }

    var roots = Iterator<MerkleRoot>.new(report.merkleRoots);

    while (!roots.empty()) {
        val root = roots.next();

        // validate lane not cursed

        val sourceChainConfig = st.sourceChainConfigs.mustGet(root.sourceChainSelector, ERROR_SOURCE_CHAIN_NOT_ENABLED);

        assert(sourceChainConfig.isEnabled,ERROR_SOURCE_CHAIN_NOT_ENABLED);

        // validate against sourceChainConfig etc
        // increment seqNr

        // initialize MerkleRoot subcontract
        val initMsg = createMessage({
            bounce: true, // TODO: could bounce if root already exists
            value: ton("1"), // TODO:
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
            body: Deployable_Initialize {
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
    st.ocr3Base.load().transmit(
        sender,
        OCR_PLUGIN_TYPE_COMMIT,
        msg.reportContext,
        report.toCell(),
        msg.signatures
    );

    emit(CCIP_COMMIT_REPORT_ACCEPTED_TOPIC, CommitReportAccepted {
        priceUpdates: report.priceUpdates,
        merkleRoots: report.merkleRoots,
    });

}

fun _execute(msg: OffRamp_Execute, sender: address) {
    var st = Storage.load();

    // TODO: manual execution flag
    // TODO: check if chain was cursed by RMNRemote

    val report = msg.report;
    var messages = Iterator<Any2TVMRampMessage>.new(report.messages);

    assert(!messages.empty(), ERROR_EMPTY_REPORT);

    // TODO: assert(report.messages.len == offchainTokenData.len, throw UNEXPECTED_TOKEN_DATA) (
    // ^- perhaps easier to validate by checking if offchainTokenData iter is still empty after the while loop
    // Not needed if we remove batching

    val sourceChainConfig = st.sourceChainConfigs.mustGet(report.sourceChainSelector, ERROR_SOURCE_CHAIN_NOT_ENABLED);
    assert(sourceChainConfig.isEnabled, ERROR_SOURCE_CHAIN_NOT_ENABLED);

    // We do this hash here instead of in _verify to avoid two separate loops over the same data. Hashing all of the
    // message fields ensures that the message being executed is correct and not tampered with. Including the known
    // OnRamp ensures that the message originates from the correct OnRamp version. We know the sourceChainSelector
    // and destChainSelector are correct because we revert below when they are not.
    //val metadataHash = metadataHash(report.sourceChainSelector, st.chainSelector, sourceChainConfig.onRamp);
    val metadataHash = MessageMetadata{
        sourceChainSelector: report.sourceChainSelector,
        destChainSelector: st.chainSelector,
        onRamp: sourceChainConfig.onRamp.toCell(),
    }.toCell().hash();

    var hashedLeaves = createEmptyTuple();
    // TODO: is offchainTokenData not hashed?

    //TODO: Should we just assume no batching and get rid of this loop? the code would be simpler
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
        val hash = message.generateMessageId(metadataHash);
        hashedLeaves.push(hash);
    }

    // calculate merkle root 
    // without batching the root should just be the messageId each time
    var leavesIterator = TupleIterator<uint256>.new(hashedLeaves);
    var proofsIterator = Iterator<uint256>.new(report.proofs);

    val root = merkleRoot(
        leavesIterator,
        proofsIterator,
        report.proofFlagBits,
    );

    // send message to MerkleRoot (execute)
     val executeMsg = createMessage({
         bounce: true, // TODO: will bounce if root doesn't exist -> throw RootNotCommitted
         value: ton("0.1"), // TODO:
         dest: {
             stateInit: {
                 code: st.deployer,
                 data: Deployable {
                     owner: contract.getAddress(),
                     id: getMerkleRootID(root),
                 }.toCell(),
             },
             // TODO: toShard so it's collocated with offramp
         },
         
         body: MerkleRoot_Validate {
            messages: report.messages,
            proofs: report.proofs,
            proofFlagBits: report.proofFlagBits,
            metadataHash: metadataHash,
         },
     });
     executeMsg.send(SEND_MODE_REGULAR);

    // TODO: how do we handle incrementing the nonce? since execution is async this might take a while

    st.ocr3Base.load().transmit(
        sender,
        OCR_PLUGIN_TYPE_EXECUTE,
        msg.reportContext,
        msg.report.toCell(),
        beginCell().endCell(),
    );

}

//todo: maybe it should be chainConfigs and take an array
fun _updateSourceChainConfig(msg: OffRamp_UpdateSourceChainConfig, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);
    st.sourceChainConfigs.set(msg.sourceChainSelector, msg.config);
    st.store();
}


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
    // TODO: combine get staticConfig and dynamicConfig into get config
}

get fun sourceChainConfig(sourceChainSelector: uint64): SourceChainConfig {
    val st = lazy Storage.load();
    return st.sourceChainConfigs.mustGet(sourceChainSelector,ERROR_SOURCE_CHAIN_NOT_ENABLED);
}

get fun allSourceChainConfigs(): dict {
    val st = lazy Storage.load();
    return st.sourceChainConfigs.value;
}

fun applySourceChainConfigUpdates() {}

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OffRamp", "1.0.0");
 }
