import "messages"
import "errors"
import "types"
import "storage"
import "events"

import "../common/types.tolk"
import "../../deployable/types.tolk"
import "../../lib/access/ownable_2step.tolk"
import "../../lib/crypto/merkle_multi_proof.tolk"
import "../../lib/ocr/multi_ocr3_base"
import "../../lib/ocr/types"
import "../../lib/utils.tolk"
import "../fee_quoter/messages"
import "../merkle_root/messages"
import "../../lib/receiver/messages"
import "../merkle_root/storage"

const CONTRACT_VERSION = "0.0.4";

fun onInternalMessage(in:InMessage) {
    val msg = lazy OffRamp_InMessage.fromSlice(in.body);
    match(msg) {
        OffRamp_Commit => {
            _commit(msg, in.senderAddress)
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
        OffRamp_CCIPReceiveConfirm => {
            _ccipReceiveConfirm(msg, in.senderAddress);
        }
        OffRamp_NotifySuccess => {
            _notifySuccess(msg, in.senderAddress);
        }
        OffRamp_NotifyFailure => {
            _notifyFailure(msg, in.senderAddress);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy OffRamp_BouncedMessage.fromSlice(in.bouncedBody);
    match (msg) {
        Receiver_CCIPReceive => {
            // with lazy load only deserialize accessed fields (rootId), 
            // not the message reference in CCIPReceive
            _bouncedCCIPReceive(msg.rootId, in.senderAddress);
        }
    }
} 

fun _bouncedCCIPReceive(rootId: uint224, sender: address) {
    val st = Storage.load();
    val receiveBounced = createMessage({
        bounce: true,
        value: ton("0.5"),
        dest: {
            stateInit: { //the MR address
                code: st.deployer,
                data: Deployable {
                    owner: contract.getAddress(),
                    id: beginCell().storeUint(rootId, 224),
                }.toCell(), 
            },
        },
        body: MerkleRoot_CCIPReceiveBounced{
            receiver: sender
        }
    });
    receiveBounced.send(SEND_MODE_REGULAR);
}

fun _notifyFailure(msg: OffRamp_NotifyFailure, sender: address) {
    //TODO should verify this comes from a MR contract
    val messageHeader = msg.header;
    emit(EXECUTION_STATE_CHANGED_TOPIC, ExecutionStateChanged {
        sourceChainSelector: messageHeader.sourceChainSelector,
        sequenceNumber: messageHeader.sequenceNumber,
        messageId: messageHeader.messageId,
        state: ExecutionState.Failure
    });
}

fun _notifySuccess(msg: OffRamp_NotifySuccess, sender: address) {
    //TODO should verify this comes from a MR contract
    val messageHeader = msg.header;
    emit(EXECUTION_STATE_CHANGED_TOPIC, ExecutionStateChanged {
        sourceChainSelector: messageHeader.sourceChainSelector,
        sequenceNumber: messageHeader.sequenceNumber,
        messageId: messageHeader.messageId,
        state: ExecutionState.Success
    });
}

fun _ccipReceiveConfirm(msg: OffRamp_CCIPReceiveConfirm, sender: address) {
    val st = Storage.load();
    val merkleRootReceiveConfirm = createMessage({
        bounce: true,
        value: ton("0.05"), //TODO how much do we need to send
        dest: {
            stateInit: {
                code: st.deployer,
                data: Deployable {
                    owner: contract.getAddress(),
                    id: beginCell().storeUint(msg.rootId, 224),
                }.toCell(),
            }
        },
        body: MerkleRoot_CCIPReceiveConfirm {
            receiver: sender,
        }, 
    });
    merkleRootReceiveConfirm.send(SEND_MODE_REGULAR);
}

// TODO: handle signals from MerkleRoot for releaseTokens
// maybe send these and MerkleRoot_Execute straight to router
// the payload would need the id & chainSelector so we can calculate/validate offrampAddress & that the merkle root is allowed to send for that ID
// NOTE: this assumes router has a well known, static address. So two stage deployment: put up router, then compile the addr into contracts
// (or init contract state with that router addr? probably what solana does)
//TODO: This function should relay to the router or the message should be received directly by the router
fun _dispatchValidated(msg: OffRamp_DispatchValidated, sender: address) {
            val st = Storage.load();

            // Validate the message comes from an owned MerkleRoot contract

            val message = msg.message.load();
            val rootId = msg.rootId;

            val expectedAddress: AutoDeployAddress = {
                stateInit: {
                    code: st.deployer,
                    data: Deployable {
                        owner: contract.getAddress(),
                        id: beginCell().storeUint(rootId, 224),
                    }.toCell()
                }
            };
            assert(expectedAddress.addressMatches(sender)) throw Error.DispatchNotFromMerkleRoot;

            // dispatch message to receiver
            val ccipReceive: Receiver_CCIPReceive = {
                rootId: rootId, // receiver should call back the MR directly
                message: {
                    messageId: message.header.messageId,
                    sourceChainSelector: message.header.sourceChainSelector,
                    sender: CrossChainAddress.fromCell(message.sender),
                    data: message.data
                },
            };

            val messageForReceiver = createMessage({
                bounce: true,
                value: ton("0.05"), // TODO: use the gas limit from the message
                dest: message.receiver,
                body: ccipReceive
            });
            messageForReceiver.send(SEND_MODE_REGULAR);

            //TODO: It makes sense to emit this event from a separate message NotifyInProgress
            // That message would be sent right before DispatchValidated if there are no token transfers 
            // or along with the messages to the token pools if there are token transfers 
            val header = message.header;
            emit(EXECUTION_STATE_CHANGED_TOPIC, ExecutionStateChanged {
                sourceChainSelector: header.sourceChainSelector,
                sequenceNumber: header.sequenceNumber,
                messageId: header.messageId,
                state: ExecutionState.InProgress
            });
}

fun _setOCR3Config(msg: OCR3Base_SetOCR3Config, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);

    var ocr3Base = st.ocr3Base.load();
    ocr3Base.setOcr3Config(msg);

    st.ocr3Base = ocr3Base.toCell();
    st.store();
}

fun _commit(msg: OffRamp_Commit, sender: address) {
    var st = lazy Storage.load();

    val report = msg.report;

    // update token/gas prices if any
    if (report.priceUpdates != null) {
        // extract OCR sequence number from report context (matches EVM implementation)
        val ocrSequenceNumber = msg.reportContext.sequenceBytes;

        // check for price staleness based on the OCR sequence number
        if (st.latestPriceSequenceNumber < ocrSequenceNumber) {
            // if prices are not stale, update the latest sequence number
            st.latestPriceSequenceNumber = ocrSequenceNumber;
            
            // and update the prices in the fee quoter
            val updatePricesMsg = createMessage({
                bounce: true,
                value: ton("0.05"), // TODO:
                dest: st.feeQuoter,
                body: FeeQuoter_UpdatePrices {
                    updates: report.priceUpdates!.load()
                },
            });
            updatePricesMsg.send(SEND_MODE_REGULAR);
        }
        // note: if prices are stale, we continue to process merkle roots if any exist
    }

    var roots = report.merkleRoots.iter();
    val priceUpdatesOnlyReport = roots.empty();
    while (!roots.empty()) {
        val root = roots.next();

        // validate lane not cursed

        var sourceChainConfig = st.sourceChainConfigs.mustGet(root.sourceChainSelector, Error.SourceChainNotEnabled as int);

        assert(sourceChainConfig.isEnabled, Error.SourceChainNotEnabled);

        // validate against sourceChainConfig etc

        // set next expected sequence number to maxSeqNr + 1 (matches EVM implementation)
        sourceChainConfig.minSeqNr = root.maxSeqNr + 1;
        st.sourceChainConfigs.replaceIfExists(root.sourceChainSelector, sourceChainConfig);

        val rootId = getMerkleRootID(root.merkleRoot);
        // initialize MerkleRoot subcontract
        val initMsg = createMessage({
            bounce: true, // TODO: could bounce if root already exists but i don't think we shuold handle it
            value: ton("1"), // TODO:
            dest: {
                stateInit: {
                    code: st.deployer,
                    data: Deployable {
                        owner: contract.getAddress(),
                        id: rootId,
                    }.toCell(),
                },
                // TODO: toShard so it's collocated with offramp
            },
            body: Deployable_Initialize {
                stateInit: {
                    code: st.merkleRootCode,
                    data: MerkleRoot_Storage {
                        rootId: rootId.endCell().beginParse().loadUint(224), 
                        owner: contract.getAddress(),
                        state: 0,
                        executionState: 0,
                        tokenBalance: TokenBalance{}
                    }.toCell(),
                }
            },
        });

        initMsg.send(SEND_MODE_REGULAR);
    }

    // store updated state (latestPriceSequenceNumber and sourceChainConfigs)
    st.store();

    // Verifies signatures and emits Transmitted event
    st.ocr3Base.load().transmit(
        sender,
        OCR_PLUGIN_TYPE_COMMIT,
        msg.reportContext,
        report.toCell(),
        msg.signatures
    );

    var root: MerkleRoot? = null;
    if (!priceUpdatesOnlyReport) {
        root = MerkleRoot.fromCell(report.merkleRoots);
    }
    emit(
        CCIP_COMMIT_REPORT_ACCEPTED_TOPIC,
        CommitReportAccepted { merkleRoot: root, priceUpdates: report.priceUpdates }
    );
}

fun _execute(msg: OffRamp_Execute, sender: address) {
    var st = Storage.load();

    // TODO: manual execution flag
    // TODO: check if chain was cursed by RMNRemote

    val report = msg.report;

    var sourceChainConfigResult = st.sourceChainConfigs.get(report.sourceChainSelector);
    assert(sourceChainConfigResult.isFound, Error.SourceChainNotEnabled);

    val sourceChainConfig = sourceChainConfigResult.loadValue();
    assert(sourceChainConfig.isEnabled, Error.SourceChainNotEnabled);

    // We do this hash here instead of in _verify to avoid two separate loops over the same data. Hashing all of the
    // message fields ensures that the message being executed is correct and not tampered with. Including the known
    // OnRamp ensures that the message originates from the correct OnRamp version. We know the sourceChainSelector
    // and destChainSelector are correct because we revert below when they are not.
    val metadataHash = MessageMetadata{
        sourceChainSelector: report.sourceChainSelector,
        destChainSelector: st.chainSelector,
        onRamp: sourceChainConfig.onRamp.toCell(),
    }.toCell().hash();


    assert(!report.messages.beginParse().isEmpty(), Error.EmptyExecutionReport);
    val message = Any2TVMRampMessage.fromCell(report.messages);

    // Commits do not verify the destChainSelector in the message since only the root is committed, so we
    // have to check it explicitly. This check is also important as we have assumed the metaDataHash above uses
    // the i_chainSelector as the destChainSelector.
    assert(message.header.destChainSelector == st.chainSelector, Error.InvalidMessageDestChainSelector);

    // If the message source chain selector does not match the report's source chain selector and the root has not
    // been committed for the report source chain selector this will be caught by the root verification.
    // This acts as an extra check to ensure the message source chain selector matches the report's source chain.
    assert(message.header.sourceChainSelector == report.sourceChainSelector, Error.SourceChainSelectorMismatch);

    val root = message.generateMessageId(metadataHash);

    // send message to MerkleRoot (execute)
     val executeMsg = createMessage({
         bounce: true,
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
            message: Any2TVMRampMessage.fromCell(report.messages),
         },
     });
     executeMsg.send(SEND_MODE_REGULAR);

    // TODO: how do we handle incrementing the nonce? since execution is async this might take a while

    st.ocr3Base.load().transmit(
        sender,
        OCR_PLUGIN_TYPE_EXECUTE,
        msg.reportContext,
        msg.report.toCell(),
        createEmptyCell(),
    );

}

//todo: maybe it should be chainConfigs and take an array?
fun _updateSourceChainConfig(msg: OffRamp_UpdateSourceChainConfig, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);
    var config: SourceChainConfig;
    var existingConfigEntry = st.sourceChainConfigs.get(msg.sourceChainSelector);
    if (!existingConfigEntry.isFound) {
        config = SourceChainConfig {
            router: msg.config.router,
            isEnabled: msg.config.isEnabled,
            minSeqNr: 1,
            isRMNVerificationDisabled: true, // RMN verification is always disabled
            onRamp: msg.config.onRamp,
        };
    } else {
        // OnRamp updates should only happen due to a misconfiguration.
        // If an OnRamp is misconfigured, no reports should have been
        // committed and no messages should have been executed.        
        config = existingConfigEntry.loadValue();
        assert(config.minSeqNr == 1 || config.onRamp.bitsEqual(msg.config.onRamp)) throw Error.InvalidOnRampUpdate;
        config.isEnabled = msg.config.isEnabled;
        config.onRamp = msg.config.onRamp;
    }
    st.sourceChainConfigs.set(msg.sourceChainSelector, config);
    st.store();
}

@pure @inline
fun getMerkleRootID(merkleRoot: uint256): builder {
    var cs = beginCell().storeUint(merkleRoot, 256).endCell().beginParse();
    return beginCell() // id:u16 = 1 | merkleRoot:256
        .storeUint(cs.loadUint(224), 224);
}

// get fun executionState() {
//     // TODO: node will need to directly look at MerkleRoot subcontracts
// }
// get fun merkleRoot() {
//     // TODO: node will need to directly look at MerkleRoot subcontracts
// }
get fun latestPriceSequenceNumber(): uint64 {
    var st = lazy Storage.load();
    return st.latestPriceSequenceNumber
}

fun setDynamicConfig() {
    
}

get fun ocr3Config(): OCR3Base {
    var st = lazy Storage.load();
    return st.ocr3Base.load();
}

get fun config(): Config {
    val st = lazy Storage.load();
    return {
        chainSelector: st.chainSelector,
        feeQuoter: st.feeQuoter,
        permissionlessExecutionThresholdSeconds: st.permissionlessExecutionThresholdSeconds,
    }
}

get fun sourceChainConfig(sourceChainSelector: uint64): SourceChainConfig {
    val st = lazy Storage.load();
    return st.sourceChainConfigs.mustGet(sourceChainSelector,Error.SourceChainNotEnabled as int);
}

get fun allSourceChainConfigs(): map<uint64, SourceChainConfig> {
    val st = lazy Storage.load();
    return st.sourceChainConfigs;
}

fun applySourceChainConfigUpdates() {}

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.OffRamp", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.OffRamp"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.OffRamp"), local);
}

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}
