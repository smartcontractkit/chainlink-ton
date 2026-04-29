// SPDX-License-Identifier: BUSL-1.1
tolk 1.2

import "../../lib/access/ownable_2step";
import "../../lib/utils";
import "../../lib/versioning/upgradeable"
import "../../lib/deployable/types"

import "../common/types";

import "../ccipsend_executor/storage"
import "../ccipsend_executor/types"
import "../ccipsend_executor/messages"
import "../router/messages"
import "../fee_quoter/messages"
import "../fee_quoter/types"

import "events"
import "types"
import "events"
import "storage"
import "errors"
import "messages"

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy OnRamp_InMessage.fromSlice(in.body);
    match (msg) {
        // Permissionless
        OnRamp_GetValidatedFee<RemainingBitsAndRefs> => {
            onGetValidatedFee(msg, in.senderAddress)
        }
        // Sender must be the FeeQuoter
        FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext> => {
            val st = lazy OnRamp_Storage.load();
            val feeQuoterAddress = st.config.load().feeQuoter;
            assert (in.senderAddress == feeQuoterAddress, Error.Unauthorized);
            onMessageValidated(msg)
        }
        // Sender must be the FeeQuoter
        FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext> => {
            val st = lazy OnRamp_Storage.load();
            val feeQuoterAddress = st.config.load().feeQuoter;
            assert (in.senderAddress == feeQuoterAddress, Error.Unauthorized);
            onMessageValidationFailed(msg)
        }
        // Sender must be the Router
        OnRamp_Send => {
            var st = lazy OnRamp_Storage.load();
            val ccipSend = msg.msg.load();
            // validate allowlist
            val destChainConfigResult = st.destChainConfigs.get(ccipSend.destChainSelector);
            if (!destChainConfigResult.isFound) {
                // This is a config error. The Router should not be sending messages to unknown chains.
                return rejectMessage(Error.UnknownDestChainSelector as int, in.senderAddress, ccipSend, msg.metadata.sender);
            }
            val destChainConfig = destChainConfigResult.loadValue();
            // ccipSend must be forwarded from the router
            assert(destChainConfig.router == in.senderAddress, Error.Unauthorized);
            onSend(st, destChainConfig, msg)
        }
        // Sender must be Send Executor
        OnRamp_ExecutorFinishedSuccessfully => {
            var st = lazy OnRamp_Storage.load();
            assert(st.executor.autoDeployAddress(msg.executorID).addressMatches(in.senderAddress), Error.Unauthorized);
            onExecutorFinishedSuccessfully(st, msg);
        }
        // Sender must be Send Executor
        OnRamp_ExecutorFinishedWithError => {
            var st = lazy OnRamp_Storage.load();
            assert(st.executor.autoDeployAddress(msg.executorID).addressMatches(in.senderAddress), Error.Unauthorized);
            onExecutorFinishedWithError(st, msg);
        }
        // Sender must be the owner
        OnRamp_SetDynamicConfig => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            onSetDynamicConfig(mutate st, msg);
            st.store();
        }
        // Sender must be the owner
        OnRamp_UpdateDestChainConfigs => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            onApplyDestChainConfigUpdates(mutate st, msg.updates);
            st.store();
        }
        // Sender must be the owner
        OnRamp_UpdateAllowlists => {
            var st = lazy OnRamp_Storage.load();
            if (in.senderAddress != st.config.load().allowlistAdmin) {
                st.ownable.requireOwner(in.senderAddress);
            }
            onApplyAllowlistUpdates(mutate st, msg.updates);
            st.store();
        }
        // Sender must be the owner
        OnRamp_UpdateSendExecutor => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.executor.executorCode = msg.code;
            st.store();
        }
        // Permissionless
        OnRamp_WithdrawFeeTokens => {
            assert (in.valueCoins > OnRamp_Costs.WithdrawFeeTokens(), Error.InsufficientValue);
            onWithdrawFeeTokens(msg);
        },
        // Sender must be owner
        Upgradeable_Upgrade => {
            var st = lazy OnRamp_Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            onUpgrade(msg);
        }
        else => {
            // attempt to handle Ownable messages
            var st = lazy OnRamp_Storage.load();
            val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
            if (handled) {
                st.store();
                return;
            }

            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// Forwards a validated fee request from the OnRamp to the FeeQuoter contract
// for final fee validation.
//
// sequenceDiagram
//     participant Router
//     participant OnRamp
//     participant FeeQuoter

//     Router    ->> OnRamp:    OnRamp_GetValidatedFee
//     OnRamp    ->> FeeQuoter: FeeQuoter_GetValidatedFee
//     FeeQuoter ->> OnRamp:    FeeQuoter_MessageValidated | FeeQuoter_MessageValidationFailed
fun onGetValidatedFee(msg: OnRamp_GetValidatedFee<RemainingBitsAndRefs>, sender: address) {
    val st = lazy OnRamp_Storage.load();
    val config = st.config.load();

    val feeQuoter = config.feeQuoter;

    val getFeeMsg = createMessage({
        bounce: true,
        value: 0,
        dest: feeQuoter,
        body: FeeQuoter_GetValidatedFee<OnRamp_GetValidatedFeeContext> {
            msg: msg.ccipSend,
            context: {
                onrampContext: sender,
                userContext: msg.context
            },
        }
    });

    getFeeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Handles the reply from FeeQuoter.FeeQuoter_GetValidatedFee and replies back to the original caller.
//
// sequenceDiagram
//     participant Router
//     participant OnRamp
//     participant FeeQuoter

//     Router    ->> OnRamp:    OnRamp_GetValidatedFee
//     OnRamp    ->> FeeQuoter: FeeQuoter_GetValidatedFee
//     FeeQuoter ->> OnRamp:    FeeQuoter_MessageValidated
//     OnRamp    ->> Router:    OnRamp_MessageValidated
fun onMessageValidated(msg: FeeQuoter_MessageValidated<OnRamp_GetValidatedFeeContext>) {
    val userContext = msg.context.userContext;
    val userAddress = msg.context.onrampContext;

    val confirmation = createMessage({
        bounce: false,
        value: 0,
        dest: userAddress,
        body: OnRamp_MessageValidated<RemainingBitsAndRefs> {
            fee: msg.fee.feeTokenAmount,
            msg: msg.msg,
            context: userContext,
        }
    });

    confirmation.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Handles the reply from FeeQuoter.FeeQuoter_GetValidatedFee when FeeQuoter replies with an error
// and replies back to the original caller.
//
// sequenceDiagram
//     participant Router
//     participant OnRamp
//     participant FeeQuoter

//     Router    ->> OnRamp:    OnRamp_GetValidatedFee
//     OnRamp    ->> FeeQuoter: FeeQuoter_GetValidatedFee
//     FeeQuoter ->> OnRamp:    FeeQuoter_MessageValidationFailed
//     OnRamp    ->> Router:    OnRamp_MessageValidationFailed
fun onMessageValidationFailed(msg: FeeQuoter_MessageValidationFailed<OnRamp_GetValidatedFeeContext>) {
    val userContext = msg.context.userContext;
    val userAddress = msg.context.onrampContext;

    val rejection = createMessage({
        bounce: false,
        value: 0,
        dest: userAddress,
        body: OnRamp_MessageValidationFailed<RemainingBitsAndRefs> {
            error: msg.error,
            msg: msg.msg,
            context: userContext,
        }
    });

    rejection.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun generateRandomSendExecutorId(): CCIPSendExecutor_ID {
    random.initialize();
    return (random.uint256() >> 32) as CCIPSendExecutor_ID;
}

/*
Handles CCIP send messages forwarded by the Router. Validates that the
destination chain configuration is enabled, enforces the optional allowlist,
and deploys a CCIPSendExecutor to perform the send, carrying remaining value.
*/
fun onSend(st: OnRamp_Storage, destChainConfig: OnRamp_DestChainConfig, payload: OnRamp_Send) {
    if (destChainConfig.allowlistEnabled) {
        val entry = destChainConfig.allowedSenders.get(payload.metadata.sender);
        if (!entry.isFound || !entry.loadValue()) {
            return rejectMessage(Error.SenderNotAllowed as int, destChainConfig.router, payload.msg.load(), payload.metadata.sender);
        }
    }

    val config = st.config.load();

    val executorId = generateRandomSendExecutorId();
    val executeMsg = createMessage({
        bounce: true,
        value: 0,
        dest: st.executor.autoDeployAddress(executorId),
        body: Deployable_InitializeAndSend {
            stateInit: {
                code: st.executor.executorCode,
                data:  CCIPSendExecutor_InitialData {
                    onramp: contract.getAddress(),
                    id: executorId,
                }.toCell(),
            },
            selfMessage: {
                value: SendExecutor_Costs.Execute(),
                body: CCIPSendExecutor_Execute {
                    onrampSend: payload,
                    config: CCIPSendExecutor_Config {
                        feeQuoter: config.feeQuoter,
                    }.toCell(),
                }.toCell(),
            },
        }
    });

    executeMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    st.store();
}

/*
Handles successful completion of a CCIPSendExecutor. Assigns a new sequence
number and notifies the Router of the successful send.
*/
fun onExecutorFinishedSuccessfully(st: OnRamp_Storage, msg: OnRamp_ExecutorFinishedSuccessfully) {
    val ccipsend: Router_CCIPSend = msg.msg.load();
    val metadata = msg.metadata;

    // validate user transferred enough value
    // else refund and notify

    // assign sequence number, we can't do this sooner since the message might fail validation/getFee
    var destChainConfig = st.destChainConfigs.mustGet(ccipsend.destChainSelector, Error.UnknownDestChainSelector as int);
    destChainConfig.sequenceNumber = destChainConfig.sequenceNumber + 1;
    st.destChainConfigs.set(ccipsend.destChainSelector, destChainConfig);
    st.store();

    var rampMessage = TVM2AnyRampMessage {
        header: RampMessageHeader {
            messageId: 0, // populated after hashing
            sourceChainSelector: st.chainSelector,
            destChainSelector: ccipsend.destChainSelector,
            sequenceNumber: destChainConfig.sequenceNumber,
            // Only bump nonce for messages that specify allowOutOfOrderExecution == false. Otherwise, we may block ordered
            // message nonces, which is not what we want.
            nonce: 0,
        },
        sender: metadata.sender,
        body: TVM2AnyRampMessageBody {
            receiver: ccipsend.receiver.toCell(),
            data: ccipsend.data,
            extraArgs: ccipsend.extraArgs,
            tokenAmounts: ccipsend.tokenAmounts,
            feeToken: ccipsend.feeToken!, // guaranteed to be non-null by this point
            feeTokenAmount: msg.fee.feeTokenAmount as uint256, // safe because it is 120 bits
        }.toCell(),
        feeValueJuels: msg.fee.feeValueJuels,
    };

    // Metadata hash preimage to ensure global uniqueness, ensuring 2 identical messages sent to 2 different lanes
    // will have a distinct hash.
    val metadataHash = beginCell()
        .storeUint(stringSha256("TVM2AnyMessageHashV1"), 256)
        .storeUint(st.chainSelector, 64)
        .storeUint(ccipsend.destChainSelector, 64)
        .storeAddress(contract.getAddress())
        .endCell()
        .hash();

    rampMessage.header.messageId = rampMessage.generateMessageId(metadataHash);
    
    emit(CCIP_MESSAGE_SENT_TOPIC, CCIPMessageSent { message: rampMessage });

    val confirmation = createMessage({
        bounce: false,
        value: 0,
        dest: destChainConfig.router,
        body: Router_MessageSent {
            queryID: ccipsend.queryID,
            messageId: rampMessage.header.messageId,
            destChainSelector: ccipsend.destChainSelector,
            sender: metadata.sender,
        },
    });
    reserveToncoinsOnBalance(msg.fee.feeTokenAmount, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);
    confirmation.send(SEND_MODE_CARRY_ALL_BALANCE);
}

/*
Handles execution failures reported by a CCIPSendExecutor. Forwards a
Router_MessageRejected notification to the Router on the destination chain
with error details for tracking and recovery.
*/
fun onExecutorFinishedWithError(st: OnRamp_Storage, msg: OnRamp_ExecutorFinishedWithError) {
    val ccipSend: Router_CCIPSend = msg.msg.load();
    val metadata = msg.metadata;
    val router = st.destChainConfigs.mustGet(ccipSend.destChainSelector, Error.UnknownDestChainSelector as int).router;
    rejectMessage(msg.error, router, ccipSend, metadata.sender);
}

fun rejectMessage(error: int, router: address, ccipSend: Router_CCIPSend, sender: address) {
    val errorMsg = createMessage({
        bounce: false,
        value: 0,
        dest: router,
        body: Router_MessageRejected {
            queryID: ccipSend.queryID,
            destChainSelector: ccipSend.destChainSelector,
            sender,
            error,
        },
    });
    errorMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/*
Sets the dynamic configuration for the OnRamp contract and emits an update
event. Updates are stored directly from the provided message payload.
Only the owner is authorized to call this function.
*/
fun onSetDynamicConfig(mutate st: OnRamp_Storage, msg: OnRamp_SetDynamicConfig) {
    // feeQuoter and feeAggregator are typed as address, so they're guaranteed not null (vs `address?`)
    st.config = msg.config.toCell();

    emit(
        CONFIG_SET_TOPIC,
        ConfigSet {
            chainSelector: st.chainSelector,
            dynamicConfig: msg.config,
        }
    )
}


/*
Applies destination chain configuration updates by creating new configurations or updating
existing ones. Only the owner is authorized to call this function.
*/
fun onApplyDestChainConfigUpdates(mutate st: OnRamp_Storage, updates: SnakedCell<OnRampUpdateDestChainConfig>) {
    var iter = updates.iter();

    while (!iter.empty()) {
        val update = iter.next();
        // create or update entries
        var config: OnRamp_DestChainConfig;
        val entry = st.destChainConfigs.get(update.destChainSelector);
        if (entry.isFound) {
            config = entry.loadValue();
            config.router = update.router;
            config.allowlistEnabled = update.allowlistEnabled;
            st.destChainConfigs.replaceIfExists(update.destChainSelector, config);
        } else {
            config = OnRamp_DestChainConfig {
                router: update.router,
                sequenceNumber: 0,
                allowlistEnabled: update.allowlistEnabled,
                allowedSenders: createEmptyMap(),
            };
            st.destChainConfigs.set(update.destChainSelector, config);
            emit(DEST_CHAIN_SELECTOR_ADDED_TOPIC, DestChainSelectorAdded {
                destChainSelector: update.destChainSelector
            });
        }
        emit(DEST_CHAIN_CONFIG_UPDATED_TOPIC, DestChainConfigUpdated {
            destChainSelector: update.destChainSelector,
            destChainConfig: config,
        });
    }
}

/*
Applies allowlist updates for destination chain configurations in the
OnRamp contract. Adds or removes sender addresses from each chain’s
allowedSenders map. Only the owner is authorized to call this function.
*/
fun onApplyAllowlistUpdates(mutate st: OnRamp_Storage, updates: SnakedCell<UpdateAllowlist>) {
    var iter = updates.iter();

    while (!iter.empty()) {
        val update = iter.next();

        var config = st.destChainConfigs.mustGet(update.destChainSelector, Error.UnknownDestChainSelector as int);

        var iterAdd = update.add.iter();
        while (!iterAdd.empty()) {
            val sender = iterAdd.next();
            config.allowedSenders.set(sender, true);
        }

        var iterRemove = update.remove.iter();
        while (!iterRemove.empty()) {
            val sender = iterRemove.next();
            config.allowedSenders.delete(sender);
        }

        st.destChainConfigs.set(update.destChainSelector, config);
    }
}

/*
Handles contract upgrade requests using the Upgradeable pattern. Invokes the
upgrade process with the current migrate function and version metadata.
*/
fun onUpgrade(msg: Upgradeable_Upgrade) {
    Upgradeable{ migrate, version}.upgrade(msg);
}

fun onWithdrawFeeTokens(msg: OnRamp_WithdrawFeeTokens) {
    val feeTokens = msg.feeTokens.iter();
    // We do not support fee payments in tokens yet, so we only withdraw TON coins for now.
    // This will change in future versions.
    assert (feeTokens.empty()) throw Error.UnknownToken;
    val st = lazy OnRamp_Storage.load();
    val config = st.config.load();

    reserveToncoinsOnBalance(config.reserve, RESERVE_MODE_AT_MOST);

    val withdrawMsg = createMessage({
        bounce: true,
        value: 0,
        dest: config.feeAggregator,
        body: createEmptyCell(),
    });
    withdrawMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

get fun isChainSupported(destChainSelector: uint64): bool {
    val st = lazy OnRamp_Storage.load();
    val entry = st.destChainConfigs.get(destChainSelector);
    return entry.isFound;
}

get fun expectedNextSequenceNumber(destChainSelector: uint64): uint64 {
    val st = lazy OnRamp_Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
    return config.sequenceNumber + 1;
}

// Note: getStaticConfig name is kept to match EVM implementation, but only chain selector is part of that original static config
get fun staticConfig(): uint64 {
    val st = lazy OnRamp_Storage.load();
    return st.chainSelector;
}

get fun dynamicConfig(): OnRamp_DynamicConfig {
    val st = lazy OnRamp_Storage.load();
    return st.config.load()
}

get fun destChainConfig(destChainSelector: uint64): OnRamp_DestChainConfig {
    val st = lazy OnRamp_Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
}

// We are taking destChainSelector as param to enable future per-destination feeQuoters
get fun feeQuoter(destChainSelector: int): address {
    val st = lazy OnRamp_Storage.load();
    val config = st.config.load();
    return config.feeQuoter;
}

// vec<address>
get fun allowedSendersList(destChainSelector: uint64): tuple? {
    val st = lazy OnRamp_Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,Error.UnknownDestChainSelector as int);
    var allowedSenders = config.allowedSenders;

    return keysLispList(allowedSenders);
}

get fun destChainSelectors(): tuple? {
    val st = lazy OnRamp_Storage.load();
    var d = st.destChainConfigs;
    return keysLispList(d)!;
}

/// Gets the current owner of the contract.
get fun owner(): address {
    val st = lazy OnRamp_Storage.load();
    return st.ownable.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun pendingOwner(): address? {
    val st = lazy OnRamp_Storage.load();
    return st.ownable.get_pendingOwner();
}

get fun sendExecutorCode(): cell {
    val st = lazy OnRamp_Storage.load();
    return st.executor.executorCode;
}
 
get fun sendExecutorCodeHash(): uint256 {
    val st = lazy OnRamp_Storage.load();
    return st.executor.executorCode.hash();
}

get fun typeAndVersion(): (slice, slice) {
    return (OnRamp_FACILITY_NAME, CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return OnRamp_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.ccip.OnRamp"), local);
}

get fun reserve(): coins {
    val st = lazy OnRamp_Storage.load();
    val config = st.config.load();
    return config.reserve;
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }
