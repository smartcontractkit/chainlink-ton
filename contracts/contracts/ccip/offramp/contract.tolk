import "messages"
import "errors"
import "types"
import "storage"
import "events"

import "../../lib/versioning/upgradeable"
import "../common/types.tolk"
import "../../deployable/types.tolk"
import "../../lib/access/ownable_2step.tolk"
import "../../lib/funding/withdrawable.tolk"
import "../../lib/crypto/merkle_multi_proof.tolk"
import "../../lib/ocr/multi_ocr3_base"
import "../../lib/ocr/types"
import "../../lib/utils.tolk"
import "../fee_quoter/messages"
import "../merkle_root/messages"
import "../../lib/receiver/messages"
import "../merkle_root/storage"
import "../receive_executor/messages"
import "../receive_executor/storage"

const CONTRACT_VERSION = "0.0.12";
const RESERVE = ton("1"); // TODO: set correct value

fun onInternalMessage(in:InMessage) {
    val msg = lazy OffRamp_InMessage.fromSlice(in.body);
    match(msg) {
        // Sender must be OCR transmitter
        OffRamp_Commit => {
            _commit(msg, in.senderAddress)
        }
        // Permissionless
        OffRamp_Execute => {
            _execute(msg, in.senderAddress)
        }
        // Sender must be MerkleRoot
        OffRamp_ExecuteValidated => {
            _executeValidated(msg, in.senderAddress)
        }
        // Sender must be ReceiveExecutor
        OffRamp_DispatchValidated => {
            _messageReadyForDispatch(msg, in.senderAddress)
        } 
        OffRamp_ManuallyExecute => {
            _manually_execute(msg, in.senderAddress)
        }
        // Sender must be owner
        OCR3Base_SetOCR3Config => { 
            _setOCR3Config(msg, in.senderAddress)
        }
        // Sender must be owner
        OffRamp_UpdateSourceChainConfig => {
            _updateSourceChainConfig(msg, in.senderAddress)
        }
        // Sender must be receiver
        OffRamp_CCIPReceiveConfirm => {
            _ccipReceiveConfirm(msg, in.senderAddress);
        }
        // Sender must be ReceiveExecutor
        OffRamp_NotifySuccess => {
            _notifySuccess(msg, in.senderAddress);
        }
        // Sender must be ReceiveExecutor
        OffRamp_NotifyFailure => {
            _notifyFailure(msg, in.senderAddress);
        }
        Withdrawable_Withdraw => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg, in.valueCoins);
        }
        Upgradeable_Upgrade => {
            _upgrade(msg, in.senderAddress);
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
            _bouncedCCIPReceive(msg.execId, in.senderAddress);
        }
    }
}

fun _upgrade(msg: Upgradeable_Upgrade, sender: address) {
    val st = Storage.load();
    st.ownable.requireOwner(sender);
    Upgradeable{
        migrate: migrate,
        version: version,
    }.upgrade(msg);
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

fun _bouncedCCIPReceive(execId: uint192, sender: address) {
    val st = Storage.load();
    val receiveBounced = createMessage({
        bounce: true,
        value: ton("0.05"),
        dest: {
            stateInit: { //the ReceiveExecutor address
                code: st.deployables.load().deployer,
                data: Deployable {
                    owner: contract.getAddress(),
                    id: beginCell().storeUint(execId, RECEIVE_EXECUTOR_ID_SIZE),
                }.toCell(), 
            },
        },
        body: ReceiveExecutor_Bounced{
            receiver: sender
        }
    });
    receiveBounced.send(SEND_MODE_REGULAR);
}

fun markStateOnRoot(root: address, seqNum: uint64, state: ExecutionState) {
    val markState= createMessage({
        bounce: false,
        value: ton("0.05"),
        dest: root,
        body: MerkleRoot_MarkState {
            seqNum,
            state,
        },
    });
    markState.send(SEND_MODE_REGULAR);
}

// Received from ReceiveExecutor after validating that the confirm message came from the correct receiver
fun _notifySuccess(msg: OffRamp_NotifySuccess, sender: address) {
    assertSenderIsOwnedContract(Storage.load(), sender, beginCell().storeUint(msg.execId, RECEIVE_EXECUTOR_ID_SIZE));

    // propagate state change to root
    markStateOnRoot(msg.root, msg.header.sequenceNumber, ExecutionState.Success);

    val messageHeader = msg.header;
    emit(EXECUTION_STATE_CHANGED_TOPIC, ExecutionStateChanged {
        sourceChainSelector: messageHeader.sourceChainSelector,
        sequenceNumber: messageHeader.sequenceNumber,
        messageId: messageHeader.messageId,
        state: ExecutionState.Success
    });
}

// Received from ReceiveExecutor after validating that the bounce message came from the correct receiver and enabling manual execute to retry
fun _notifyFailure(msg: OffRamp_NotifyFailure, sender: address) {
    assertSenderIsOwnedContract(Storage.load(), sender, beginCell().storeUint(msg.execId, RECEIVE_EXECUTOR_ID_SIZE));

    // propagate state change to root
    markStateOnRoot(msg.root, msg.header.sequenceNumber, ExecutionState.Failure);

    val messageHeader = msg.header;
    emit(EXECUTION_STATE_CHANGED_TOPIC, ExecutionStateChanged {
        sourceChainSelector: messageHeader.sourceChainSelector,
        sequenceNumber: messageHeader.sequenceNumber,
        messageId: messageHeader.messageId,
        state: ExecutionState.Failure
    });
}

// Sent by the receiver to confirm successful receipt of the message,
// ReceiveExecutor must further validate that the sender is the intended receiver
fun _ccipReceiveConfirm(msg: OffRamp_CCIPReceiveConfirm, sender: address) {
    val st = Storage.load();
    val receiveConfirm = createMessage({
        bounce: true,
        value: ton("0.05"), //TODO how much do we need to send
        dest: {
            stateInit: {
                code: st.deployables.load().deployer,
                data: Deployable {
                    owner: contract.getAddress(),
                    id: beginCell().storeUint(msg.execId, RECEIVE_EXECUTOR_ID_SIZE),
                }.toCell(),
            }
        },
        body: ReceiveExecutor_Confirm {
            receiver: sender,
        }, 
    });
    receiveConfirm.send(SEND_MODE_REGULAR);
}

// TODO: handle signals from MerkleRoot for releaseTokens
// maybe send these and MerkleRoot_Execute straight to router
// the payload would need the id & chainSelector so we can calculate/validate offrampAddress & that the merkle root is allowed to send for that ID
// NOTE: this assumes router has a well known, static address. So two stage deployment: put up router, then compile the addr into contracts
// (or init contract state with that router addr? probably what solana does)

//TODO: This function should relay to the router
fun _messageReadyForDispatch(msg: OffRamp_DispatchValidated, sender: address) {
    val st = Storage.load();

    // Validate the message comes from an owned ReceiveExecutor contract

    val message = msg.message.load();
    val execId = msg.execId;

    assertSenderIsOwnedContract(st, sender, beginCell().storeUint(execId, RECEIVE_EXECUTOR_ID_SIZE));

    // dispatch message to receiver
    val ccipReceive: Receiver_CCIPReceive = {
        execId: execId,
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

        val rootId = getOwnedMerkleRootContractId(root.merkleRoot);

        // initialize MerkleRoot subcontract
        val initMsg = createMessage({
            bounce: true, // TODO: could bounce if root already exists but i don't think we shuold handle it
            value: ton("0.5"), // TODO:
            dest: {
                stateInit: {
                    code: st.deployables.load().deployer,
                    data: Deployable {
                        owner: contract.getAddress(),
                        id: rootId,
                    }.toCell(),
                },
                // TODO: toShard so it's collocated with offramp
            },
            body: Deployable_Initialize {
                stateInit: {
                    code: st.deployables.load().merkleRootCode,
                    data: MerkleRoot_Storage {
                        root: root.merkleRoot, 
                        owner: contract.getAddress(),
                        timestamp: blockchain.now(),
                        minMsgNr: root.minSeqNr,
                        maxMsgNr: root.maxSeqNr,
                        messageStates: 0,
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
        TOPIC_COMMIT_REPORT_ACCEPTED,
        CommitReportAccepted { merkleRoot: root, priceUpdates: report.priceUpdates }
    );
}

fun _manually_execute(msg: OffRamp_ManuallyExecute, sender: address) {
    var st = Storage.load();

    val report = msg.report;

    // when_chain_not_forked assert

    _execute_single_report(msg.report, msg.gasOverride, sender);

}

fun _execute(msg: OffRamp_Execute, sender: address) {
    _execute_single_report(msg.report, null, sender);

    var st = Storage.load();

    st.ocr3Base.load().transmit(
        sender,
        OCR_PLUGIN_TYPE_EXECUTE,
        msg.reportContext,
        msg.report.toCell(),
        createEmptyCell(),
    );

}

fun _execute_single_report(report: ExecutionReport, gasOverride: coins?, sender: address) {
    var st = Storage.load();

    // TODO: check if chain was cursed by RMNRemote

    var sourceChainConfigResult = st.sourceChainConfigs.get(report.sourceChainSelector);
    assert(sourceChainConfigResult.isFound, Error.SourceChainNotEnabled);

    val sourceChainConfig = sourceChainConfigResult.loadValue();
    assert(sourceChainConfig.isEnabled, Error.SourceChainNotEnabled);

    // We do this hash here instead of in _verify to avoid two separate loops over the same data. Hashing all of the
    // message fields ensures that the message being executed is correct and not tampered with. Including the known
    // OnRamp ensures that the message originates from the correct OnRamp version. We know the sourceChainSelector
    // and destChainSelector are correct because we revert below when they are not.
    val metadataHash = MessageMetadata {
        sourceChainSelector: report.sourceChainSelector,
        destChainSelector: st.chainSelector,
        onRamp: sourceChainConfig.onRamp.toCell(),
    }.toCell().hash();


    assert(!report.messages.beginParse().isEmpty(), Error.EmptyExecutionReport);

    // No execution batching so no need to use iterator
    val message = Any2TVMRampMessage.fromCell(report.messages);

    // Commits do not verify the destChainSelector in the message since only the root is committed, so we
    // have to check it explicitly. This check is also important as we have assumed the metaDataHash above uses
    // the i_chainSelector as the destChainSelector.
    assert(message.header.destChainSelector == st.chainSelector, Error.InvalidMessageDestChainSelector);

    // If the message source chain selector does not match the report's source chain selector and the root has not
    // been committed for the report source chain selector this will be caught by the root verification.
    // This acts as an extra check to ensure the message source chain selector matches the report's source chain.
    assert(message.header.sourceChainSelector == report.sourceChainSelector, Error.SourceChainSelectorMismatch);

    var leafTuple: tuple = createEmptyTuple();
    leafTuple.push(message.generateMessageId(metadataHash));

    val root = merkleRoot(TupleIterator<uint256>.new(leafTuple), Iterator<uint256>.new(report.proofs), report.proofFlagBits);

    // send message to MerkleRoot (execute)
    val executeMsg = createMessage({
         bounce: true,
         value: ton("0.05"), // TODO:
         dest: {
             stateInit: {
                 code: st.deployables.load().deployer,
                 data: Deployable {
                     owner: contract.getAddress(),
                     id: getOwnedMerkleRootContractId(root),
                 }.toCell(),
             },
             // TODO: toShard so it's collocated with offramp
         },

         body: MerkleRoot_Validate {
            message: report.messages as Cell<Any2TVMRampMessage>,
            metadataHash: metadataHash,
            permissionlessExecutionThresholdSeconds: st.permissionlessExecutionThresholdSeconds,
            gasOverride,
         },
     });
     executeMsg.send(SEND_MODE_REGULAR);
}

//TODO: maybe it should be chainConfigs and take an array?
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
        emit(SOURCE_CHAIN_SELECTOR_ADDED_TOPIC, SourceChainSelectorAdded {
            sourceChainSelector: msg.sourceChainSelector,
        })
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
    emit(SOURCE_CHAIN_CONFIG_UPDATED_TOPIC, SourceChainConfigUpdated {
        sourceChainSelector: msg.sourceChainSelector,
        sourceChainConfig: config,
    })
}

fun _executeValidated(msg: OffRamp_ExecuteValidated, sender: address) {
    val st = Storage.load();

    // Validate the message comes from an owned MerkleRoot contract

    val message = msg.message.load();

    assertSenderIsOwnedContract(st, sender, getOwnedMerkleRootContractId(msg.root));

    emit(EXECUTION_STATE_CHANGED_TOPIC, ExecutionStateChanged {
        sourceChainSelector: message.header.sourceChainSelector,
        sequenceNumber: message.header.sequenceNumber,
        messageId: message.header.messageId,
        state: ExecutionState.InProgress
    });

    initializeExecutor(st, sender, message, msg.metadataHash);
}

fun initializeExecutor(st: Storage, rootAddress: address, message: Any2TVMRampMessage, metadataHash: uint256) {
    // Deploy executor
    val messageId = message.generateMessageId(metadataHash);
    val execIdBuilder = getOwnedReceiveExecutorContractId(messageId);
    val execIdValue = execIdBuilder.endCell().beginParse().loadUint(RECEIVE_EXECUTOR_ID_SIZE);

    val executorAddress: AutoDeployAddress = {
        stateInit: {
            code: st.deployables.load().deployer,
            data: Deployable {
                owner: contract.getAddress(),
                id: execIdBuilder,
            }.toCell()
        }
    };

    val deployMsg = createMessage({
        bounce: true, 
        value: ton("0.5"), // TODO:
        dest: executorAddress,
        // TODO: toShard so it's collocated 
        body: Deployable_Initialize {
            stateInit: {
                code: st.deployables.load().receiveExecutorCode,
                data: ReceiveExecutor_Storage {
                    owner: contract.getAddress(),
                    message: message.toCell(), 
                    root: rootAddress,
                    execId: execIdValue,
                }.toCell(),
            }
        },
    });
    deployMsg.send(SEND_MODE_REGULAR);

    val initExecMsg = createMessage ({
        bounce: true,
        value: ton("0.05"), // TODO:
        dest: executorAddress,
        body: ReceiveExecutor_InitExecute {}
    });
    initExecMsg.send(SEND_MODE_REGULAR);
}


fun getOwnedMerkleRootContractId(root: uint256): builder {
    return beginCell().storeUint(root, MERKLE_ROOT_ID_SIZE);
}

@inline
fun getOwnedReceiveExecutorContractId(messageId: uint256): builder {
    var cs = beginCell().storeUint(messageId, 256)
        .endCell().beginParse();
    return beginCell()
        .storeUint(cs.loadUint(RECEIVE_EXECUTOR_ID_SIZE), RECEIVE_EXECUTOR_ID_SIZE);
}

@inline
fun assertSenderIsOwnedContract(st: Storage, sender: address, contractId: builder) {
    val expectedAddress: AutoDeployAddress = {
        stateInit: {
            code: st.deployables.load().deployer,
            data: Deployable {
                owner: contract.getAddress(),
                id: contractId,
            }.toCell()
        }
    };
    assert(expectedAddress.addressMatches(sender)) throw Error.MessageNotFromOwnedContract;
}

get fun latestPriceSequenceNumber(): uint64 {
    var st = lazy Storage.load();
    return st.latestPriceSequenceNumber
}

get fun destChainSelectors(): tuple? {
    val st = lazy Storage.load();
    var d = st.sourceChainConfigs;
    return keysLispList(d)!;
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

get fun reserve(): coins {
    return RESERVE;
}
