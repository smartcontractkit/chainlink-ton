// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types"
import "storage"
import "messages"
import "types"
import "errors"
import "../offramp/messages"
import "../../lib/utils"
import "../token_registry/messages"
import "../pools/lib/token_pool/messages"
import "../pools/lib/token_pool/types"
import "../common/types"

tolk 1.4.1

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
            onInitExecute(mutate st, msg);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_Confirm => {
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
            onReleaseOrMintFinished(mutate st, ttInfo, msg);
            st.store();
        }
        // Sender must be the TokenPool
        TokenPool_ReleaseOrMintFailure => {
            var st = ReceiveExecutor_Storage.load();
            val ttInfo = st.state.tokenTransfer.loadOpt();
            assert (ttInfo != null && ttInfo.state is ReceiveExecutor_TokenTransferState_ReleaseOrMint) throw ReceiveExecutor_Error.TokenPoolUnexpectedResponse;
            assert(in.senderAddress == ttInfo.state.tokenPool, ReceiveExecutor_Error.Unauthorized);
            // SAFETY: TokenPool_ReleaseOrMintFailure.errorCode is uint16, so casting to int32 is safe and will not overflow.
            onReleaseOrMintFailure(mutate st, ttInfo, ttInfo.state.tokenPool, msg.errorCode as int32);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReleaseOrMint_ReleaseOrMintBounced => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, ReceiveExecutor_Error.Unauthorized);
            val ttInfo = st.state.tokenTransfer.loadOpt();
            assert (ttInfo != null && ttInfo.state is ReceiveExecutor_TokenTransferState_ReleaseOrMint) throw ReceiveExecutor_Error.TokenPoolUnexpectedResponse;
            onReleaseOrMintFailure(mutate st, ttInfo, ttInfo.state.tokenPool, msg.exitCode);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_Bounced => {
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

fun onInitExecute(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_InitExecute) { 
    if (msg.tokenAdminRegistry != null) { // Message has token transfer
        {
            // st.shouldOverrideGas = msg.gasOverride; // TODO
            val ccipSend = lazy st.message.load();
            // TODO data and token transfer not supported
            assert (ccipSend.data.beginParse().isEmpty()) throw ReceiveExecutor_Error.PTTNotSupported;
        }
        var ttInfo = st.state.tokenTransfer.loadOpt();
        ttInfo = ttInfo.init(msg.tokenAdminRegistry.load());
        if (ttInfo.state !is ReceiveExecutor_TokenTransferState_Success) {
            return match (ttInfo.state) {
                ReceiveExecutor_TokenTransferState_Untouched => queryTokenAdminRegistry(mutate st, ttInfo),
                ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed => queryTokenAdminRegistry(mutate st, ttInfo),
                ReceiveExecutor_TokenTransferState_ReleaseOrMintFailed => {
                    val rampMsg = lazy st.message.load();
                    assert (rampMsg.tokenAmounts != null) throw ReceiveExecutor_Error.NoTokenAmountsInMessage;
                    val token = rampMsg.tokenAmounts.getTokenTransfer(ReceiveExecutor_Error.UnsupportedNumberOfTokens);
                    releaseOrMint(mutate st, ttInfo, ttInfo.state.tokenPool, rampMsg,token);
                }
                ReceiveExecutor_TokenTransferState_TokenAdminRegistryQuery => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
                ReceiveExecutor_TokenTransferState_ReleaseOrMint => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
            }
        }
    }
    match (st.state.messageExecution) {
        ReceiveExecutor_MessageExecutionState.Untouched => execute(mutate st, msg.gasOverride),
        ReceiveExecutor_MessageExecutionState.Execute => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
        ReceiveExecutor_MessageExecutionState.ExecuteFailed => execute(mutate st, msg.gasOverride),
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
    val rampMsg = lazy st.message.load();
    assert (rampMsg.tokenAmounts != null) throw ReceiveExecutor_Error.NoTokenAmountsInMessage;
    val token = rampMsg.tokenAmounts.getTokenTransfer(ReceiveExecutor_Error.UnsupportedNumberOfTokens);
    if (msg.tokenPool == null) {
        ttInfo.state = ReceiveExecutor_TokenTransferState_TokenAdminRegistryQueryFailed {};
        st.state.tokenTransfer = ttInfo.toCell();
        return endExecutionWithFailure(mutate st, rampMsg.header, ReceiveExecutor_Error.TokenNotEnabledInTokenRegistry);
    }
    releaseOrMint(mutate st, ttInfo, msg.tokenPool!, rampMsg, token!);
}

fun releaseOrMint(mutate st: ReceiveExecutor_Storage, ttInfo: ReceiveExecutor_TokenTransferInfo, tokenPool: address, rampMsg: Any2TVMRampMessage, tokenAmount: Any2TVMTokenTransfer) {
    ttInfo.state = ReceiveExecutor_TokenTransferState_ReleaseOrMint { tokenPool };
    st.state.tokenTransfer = ttInfo.toCell();
    val releseOrMint = createMessage(
        {
            bounce: true,
            value: 0, // TBD should we be using tokenAmoun.destGasAmount instead? It's not clear what this field is for in TON, and it was removed in CCIP 2.0
            dest: st.owner,
            body: OffRamp_ReleaseOrMint {
                queryId: 0,
                execId: st.execId,
                tokenPool,
                requestedFinalityConfig: TOKEN_POOL_WAIT_FOR_FINALITY_FLAG,
                request: TokenPool_ReleaseOrMintInV1 {
                    transfer: TokenPool_Transfer {
                        id: 0, // TBD what should go here? Seqnum?
                        details: TokenPool_TransferDetails {
                            receiver: rampMsg.receiver,
                            remoteChainSelector: rampMsg.header.sourceChainSelector,
                            originalSender: rampMsg.sender,
                            amount: tokenAmount.amount,
                            localToken: tokenAmount.token,
                        }.toCell(),
                    },
                    sourcePoolAddress: tokenAmount.sourcePoolAddress,
                    sourcePoolData: tokenAmount.extraData,
                    offchainTokenData: null, // TBD Any2TVMTokenTransfer doesn't have this.
                }.toCell(),
            }
        }
    );
    releseOrMint.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun execute(mutate st: ReceiveExecutor_Storage, gasOverride: coins?) {
    st.lastExecutionTimestamp = blockchain.now();
    st.state.messageExecution = ReceiveExecutor_MessageExecutionState.Execute;
    createMessage(
        {
            bounce: true,
            value: 0,
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: st.message,
                execId: st.execId,
                gasOverride,
            }
        }
    ).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Finalizes message execution by returning all balance to the OffRamp and freezing the contract
fun onCCIPReceiveConfirm(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_Confirm) {
    val ccipMessage = lazy st.message.load();

    assert (msg.receiver == ccipMessage.receiver, ReceiveExecutor_Error.NotificationFromInvalidReceiver);

    endExecutionSuccessfully(mutate st, ccipMessage.header);
}

fun onCCIPReceiveBounced(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_Bounced){
    val ccipMessage = lazy st.message.load();

    assert (msg.receiver == ccipMessage.receiver, ReceiveExecutor_Error.NotificationFromInvalidReceiver);

    st.state.messageExecution = ReceiveExecutor_MessageExecutionState.ExecuteFailed;
    endExecutionWithFailure(mutate st, ccipMessage.header);
}

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
    // UNREACHABLE: onInitExecute should have thrown an error if there was any data in the message, so we should never get here.
    throw ReceiveExecutor_Error.PTTNotSupported;
    // TODO: PTT should execute after transfer
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

// TBD do we want to forward the exit code ?
fun onReleaseOrMintFailure(mutate st: ReceiveExecutor_Storage, ttInfo: ReceiveExecutor_TokenTransferInfo, tokenPool: address, _error: int32) {
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
