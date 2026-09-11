// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../lib/utils"
import "../offramp/types"
import "../offramp/messages"
import "../token_registry/messages"
import "../pools/lib/token_pool/messages"
import "../pools/lib/token_pool/types"
import "../common/types"

import "storage"
import "messages"
import "types"
import "errors"

tolk 1.4.2

const CONTRACT_VERSION = "1.7.0".literalSlice();

contract ReceiveExecutor {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.7.0"
    description: "link.chain.ton.ccip.ReceiveExecutor"

    storage: ReceiveExecutor_Storage
    incomingMessages: ReceiveExecutor_InMessage
    thrownErrors: ReceiveExecutor_Error | Utils_Error
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy ReceiveExecutor_InMessage.fromSlice(in.body);
    match (msg) {
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_InitExecute => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, ReceiveExecutor_Error.Unauthorized);
            onInitExecute(mutate st, msg, in.valueCoins);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_CCIPReceiveConfirm => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, ReceiveExecutor_Error.Unauthorized);
            assert (st.state.messageExecution == ReceiveExecutor_MessageExecutionState.Execute) throw ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage;
            onCCIPReceiveConfirm(mutate st, msg);
            st.store();
        }
        // Sender must be the TokenAdminRegistry
        TokenRegistry_ReturnTokenInfo => {
            var st = ReceiveExecutor_Storage.load();
            val ttInfo = st.state.tokenTransfer.loadOpt();
            assert (ttInfo != null && ttInfo.state is ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery) throw ReceiveExecutor_Error.TokenAdminRegistryUnexpectedResponse;
            assert(in.senderAddress == ttInfo.tokenAdminRegistry, ReceiveExecutor_Error.Unauthorized);
            onTokenAdminRegistryResponse(mutate st, msg, ttInfo);
            st.store();
        }
        // Sender must be the TokenPool
        TokenPool_ReleaseOrMintFinished => {
            var st = ReceiveExecutor_Storage.load();
            val ttInfo = st.state.tokenTransfer.loadOpt();
            assert (ttInfo != null && ttInfo.state is ReceiveExecutor_TokenTransferState_ReleaseOrMint) throw ReceiveExecutor_Error.TokenPoolUnexpectedResponse;
            assert(in.senderAddress == ttInfo.state.tokenPool, ReceiveExecutor_Error.Unauthorized);
            // TokenPool returns a small remainder of the destGasAmount set
            setGasLimitToMaximum();
            onReleaseOrMintFinished(mutate st, ttInfo, msg);
            st.store();
        }
        // Sender must be the TokenPool
        TokenPool_ReleaseOrMintFailure => {
            var st = ReceiveExecutor_Storage.load();
            val ttInfo = st.state.tokenTransfer.loadOpt();
            assert (ttInfo != null && ttInfo.state is ReceiveExecutor_TokenTransferState_ReleaseOrMint) throw ReceiveExecutor_Error.TokenPoolUnexpectedResponse;
            assert(in.senderAddress == ttInfo.state.tokenPool, ReceiveExecutor_Error.Unauthorized);
            // TokenPool returns a small remainder of the destGasAmount set
            setGasLimitToMaximum();
            onReleaseOrMintFailure(mutate st, ttInfo, ttInfo.state.tokenPool);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_ReleaseOrMintFailed => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, ReceiveExecutor_Error.Unauthorized);
            val ttInfo = st.state.tokenTransfer.loadOpt();
            assert (ttInfo != null && ttInfo.state is ReceiveExecutor_TokenTransferState_ReleaseOrMint) throw ReceiveExecutor_Error.TokenPoolUnexpectedResponse;
            onReleaseOrMintFailure(mutate st, ttInfo, ttInfo.state.tokenPool);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_CCIPReceiveFailed => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, ReceiveExecutor_Error.Unauthorized);
            assert (st.state.messageExecution == ReceiveExecutor_MessageExecutionState.Execute) throw ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage;
            onCCIPReceiveBounced(mutate st, msg);
            st.store();
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

// onInitExecute is called by the OffRamp to initiate the execution of a message in the ReceiveExecutor.
//
// @param value: The value sent with the message, which should be enough to cover the gas costs for the execution and any token transfers.
fun onInitExecute(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_InitExecute, value: coins) {
    val message = lazy st.message.load();
    
    st.state.effectiveGasLimit = msg.effectiveGasLimit;
    if (value < st.state.effectiveGasLimit + ReceiveExecutor_Costs.initExec()) {
        return endExecutionWithFailure(mutate st, message.header, 0);
    }

    if (msg.tokenTransfer != null) { // Message has token transfer
        val tokenTransfer = lazy msg.tokenTransfer.load();
        var ttInfo = st.state.tokenTransfer.loadOpt();
        if (value < st.state.effectiveGasLimit + ReceiveExecutor_Costs.initExec() + tokenTransfer.transfer.destGasAmount + ReceiveExecutor_Costs.tokenTransfer()) {
            return endExecutionWithFailure(mutate st, message.header, 0);
        }
        ttInfo = ttInfo.init(tokenTransfer.transfer, tokenTransfer.tokenAdminRegistry);

        if (ttInfo.state !is ReceiveExecutor_TokenTransferState_Success) {
            return match (ttInfo.state) {
                ReceiveExecutor_TokenTransferState_Untouched => queryTokenAdminRegistry(mutate st, ttInfo),
                ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed => queryTokenAdminRegistry(mutate st, ttInfo),
                ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed => {
                    releaseOrMint(mutate st, ttInfo, ttInfo.state.tokenPool);
                }
                ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
                ReceiveExecutor_TokenTransferState_ReleaseOrMint => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
            }
        }
    }
    match (st.state.messageExecution) {
        ReceiveExecutor_MessageExecutionState.Untouched => execute(mutate st),
        ReceiveExecutor_MessageExecutionState.Execute => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
        ReceiveExecutor_MessageExecutionState.ExecuteFailed => execute(mutate st),
        ReceiveExecutor_MessageExecutionState.Success =>  throw ReceiveExecutor_Error.MessageAlreadyExecuted,
    }
}

fun queryTokenAdminRegistry(mutate st: ReceiveExecutor_Storage, ttInfo: ReceiveExecutor_TokenTransferInfo) {
    ttInfo.state = ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery {};
    st.state.tokenTransfer = ttInfo.toCell();
    createMessage(
        {
            bounce: true,
            value: 0,
            dest: ttInfo.tokenAdminRegistry,
            body: TokenRegistry_GetTokenInfo {
            }
        }
    ).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onTokenAdminRegistryResponse(mutate st: ReceiveExecutor_Storage, msg: TokenRegistry_ReturnTokenInfo, ttInfo: ReceiveExecutor_TokenTransferInfo) {
    if (msg.tokenPool == null) {
        val rampMsg = lazy st.message.load();
        ttInfo.state = ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed {};
        st.state.tokenTransfer = ttInfo.toCell();
        return endExecutionWithFailure(mutate st, rampMsg.header, ReceiveExecutor_Error.TokenNotEnabledInTokenRegistry);
    }
    releaseOrMint(mutate st, ttInfo, msg.tokenPool!);
}

fun releaseOrMint(mutate st: ReceiveExecutor_Storage, ttInfo: ReceiveExecutor_TokenTransferInfo, tokenPool: address) {
    ttInfo.state = ReceiveExecutor_TokenTransferState_ReleaseOrMint { tokenPool };
    st.state.tokenTransfer = ttInfo.toCell();
    val transfer = lazy ttInfo.transfer.load();
    val rampMsg = lazy st.message.load();
    val releaseOrMint = createMessage(
        {
            bounce: true,
            value: transfer.destGasAmount + OffRamp_ReleaseOrMint.cost(),
            dest: st.owner,
            body: OffRamp_ReleaseOrMint {
                queryId: 0,
                execId: st.execId,
                destGasAmount: transfer.destGasAmount,
                tokenPool,
                requestedFinalityConfig: TOKEN_POOL_WAIT_FOR_FINALITY_FLAG,
                request: TokenPool_ReleaseOrMintInV1 {
                    transfer: TokenPool_Transfer {
                        id: rampMsg.header.messageId,
                        details: TokenPool_TransferDetails {
                            receiver: rampMsg.receiver,
                            remoteChainSelector: rampMsg.header.sourceChainSelector,
                            originalSender: rampMsg.sender,
                            amount: transfer.amount,
                            localToken: transfer.token,
                        }.toCell(),
                    },
                    sourcePoolAddress: transfer.sourcePoolAddress,
                    sourcePoolData: transfer.extraData,
                    offchainTokenData: null, // TBD Any2TVMTokenTransfer doesn't have this.
                }.toCell(),
            }
        }
    );
    releaseOrMint.send(SEND_MODE_PAY_FEES_SEPARATELY)
}

fun execute(mutate st: ReceiveExecutor_Storage) {
    st.lastExecutionTimestamp = blockchain.now();
    st.state.messageExecution = ReceiveExecutor_MessageExecutionState.Execute;
    createMessage(
        {
            bounce: true,
            value: OffRamp_Costs.dispatchValidated() + st.state.effectiveGasLimit,
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: st.message,
                execId: st.execId,
                effectiveGasLimit: st.state.effectiveGasLimit,
            }
        }
    ).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

// Finalizes message execution by returning all balance to the OffRamp and freezing the contract
fun onCCIPReceiveConfirm(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_CCIPReceiveConfirm) {
    val ccipMessage = lazy st.message.load();

    assert (msg.receiver == ccipMessage.receiver, ReceiveExecutor_Error.NotificationFromInvalidReceiver);

    endExecutionSuccessfully(mutate st, ccipMessage.header);
}

fun onCCIPReceiveBounced(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_CCIPReceiveFailed){
    val ccipMessage = lazy st.message.load();

    assert (msg.receiver == ccipMessage.receiver, ReceiveExecutor_Error.NotificationFromInvalidReceiver);

    st.state.messageExecution = ReceiveExecutor_MessageExecutionState.ExecuteFailed;
    endExecutionWithFailure(mutate st, ccipMessage.header);
}

// TODO add reason
fun endExecutionWithFailure(mutate st: ReceiveExecutor_Storage, messageHeader: RampMessageHeader, _errorCode: uint16 = 0) {
    // TODO send error reason
    val notifyFailure = createMessage({
        bounce: true,
        value: 0,
        dest: st.owner,
        body: OffRamp_NotifyFailure {
            header: messageHeader,
            execId: st.execId,
            root: st.root,
        },
    });
    notifyFailure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onReleaseOrMintFinished(mutate st: ReceiveExecutor_Storage, ttInfo: ReceiveExecutor_TokenTransferInfo, _msg: TokenPool_ReleaseOrMintFinished) {
    ttInfo.state = ReceiveExecutor_TokenTransferState_Success {};
    st.state.tokenTransfer = ttInfo.toCell();
    val ccipMessage = lazy st.message.load();
    if (ccipMessage.data.beginParse().isEmpty()) {
        return endExecutionSuccessfully(mutate st, ccipMessage.header);
    }
    execute(mutate st)
}

fun endExecutionSuccessfully(mutate st: ReceiveExecutor_Storage, messageHeader: RampMessageHeader) {
    st.state.messageExecution = ReceiveExecutor_MessageExecutionState.Success;

    val notifySuccess = createMessage({
        bounce: true,
        value: 0,
        dest: st.owner,
        body: OffRamp_NotifySuccess {
            header: messageHeader,
            execId: st.execId,
            root: st.root,
        },
    });
    notifySuccess.send(SEND_MODE_CARRY_ALL_BALANCE);
}

fun onReleaseOrMintFailure(mutate st: ReceiveExecutor_Storage, ttInfo: ReceiveExecutor_TokenTransferInfo, tokenPool: address) {
    ttInfo.state = ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed { tokenPool };
    st.state.tokenTransfer = ttInfo.toCell();
    val ccipMessage = lazy st.message.load();
    endExecutionWithFailure(mutate st, ccipMessage.header);
}

get fun typeAndVersion(): (slice, slice) {
    return (ReceiveExecutor_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return ReceiveExecutor_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(ReceiveExecutor_FACILITY_NAME.crc32(), local);
}
