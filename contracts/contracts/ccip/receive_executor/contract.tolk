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
        ReleaseOrMint_ReleaseOrMintFailed => {
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

fun onInitExecute(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_InitExecute) { 
    st.state.gasOverride = msg.gasOverride;
    if (msg.tokenAdminRegistry != null) { // Message has token transfer
        var ttInfo = st.state.tokenTransfer.loadOpt();
        ttInfo = ttInfo.init(msg.tokenAdminRegistry.load());
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
    val rampMsg = lazy st.message.load();
    assert (rampMsg.tokenAmounts != null) throw ReceiveExecutor_Error.NoTokenAmountsInMessage;
    val tokenTransfer = rampMsg.tokenAmounts.unwrapSingle(ReceiveExecutor_Error.UnsupportedNumberOfTokens);
    var effectiveDestGasAmount = tokenTransfer.destGasAmount;
    if (st.state.gasOverride != null && st.state.gasOverride.tokenGasOverrides != null) {
        // SAFETY: The OffRamp validates that the length of tokenGasOverrides is be the same as the number of token transfers in the message, so unwrapping the single value is safe and will not throw.
        effectiveDestGasAmount = max(st.state.gasOverride.tokenGasOverrides.unwrapSingle(ReceiveExecutor_Error.ManualExecutionGasAmountCountMismatch), effectiveDestGasAmount);
    }
    val releaseOrMint = createMessage(
        {
            bounce: true,
            value: effectiveDestGasAmount + OffRamp_ReleaseOrMint.cost(),
            dest: st.owner,
            body: OffRamp_ReleaseOrMint {
                queryId: 0,
                execId: st.execId,
                destGasAmount: effectiveDestGasAmount,
                tokenPool,
                requestedFinalityConfig: TOKEN_POOL_WAIT_FOR_FINALITY_FLAG,
                request: TokenPool_ReleaseOrMintInV1 {
                    transfer: TokenPool_Transfer {
                        id: rampMsg.header.messageId,
                        details: TokenPool_TransferDetails {
                            receiver: rampMsg.receiver,
                            remoteChainSelector: rampMsg.header.sourceChainSelector,
                            originalSender: rampMsg.sender,
                            amount: tokenTransfer.amount,
                            localToken: tokenTransfer.token,
                        }.toCell(),
                    },
                    sourcePoolAddress: tokenTransfer.sourcePoolAddress,
                    sourcePoolData: tokenTransfer.extraData,
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

    // If there is a gasOverride, replace gas limit only if override is greater than original gasLimit
    // Otherwise, keep original limit
    val msg = lazy st.message.load();
    val effectiveGasLimit = st.state.gasOverride.getEffectiveGasLimit(msg.gasLimit);
    createMessage(
        {
            bounce: true,
            value: 0,
            dest: st.owner,
            body: OffRamp_DispatchValidated {
                message: st.message,
                execId: st.execId,
                effectiveGasLimit,
            }
        }
    ).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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
