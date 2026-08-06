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
            onCCIPReceiveConfirm(mutate st, msg);
            st.store();
        }
        // Sender must be the TokenAdminRegistry
        TokenRegistry_ReturnTokenInfo => {
            var st = ReceiveExecutor_Storage.load();
            assert(st.tokenAdminRegistry != null, ReceiveExecutor_Error.Unauthorized);
            val tokenAdminRegistry = st.tokenAdminRegistry.load();
            assert(in.senderAddress == tokenAdminRegistry, ReceiveExecutor_Error.Unauthorized);
            onTokenAdminRegistryResponse(mutate st, msg);
            st.store();
        }
        // Sender must be the TokenPool
        TokenPool_ReleaseOrMintFinished => {
            var st = ReceiveExecutor_Storage.load();
            assert(st.tokenPool != null && in.senderAddress == st.tokenPool.load(), ReceiveExecutor_Error.Unauthorized);
            onReleaseOrMintFinished(mutate st, msg);
            st.store();
        }
        // Sender must be the TokenPool
        TokenPool_ReleaseOrMintFailure => {
            var st = ReceiveExecutor_Storage.load();
            assert(st.tokenPool != null && in.senderAddress == st.tokenPool.load(), ReceiveExecutor_Error.Unauthorized);
            onReleaseOrMintFailure(mutate st, msg);
            st.store();
        }
        // Sender must be the owner (OffRamp)
        ReceiveExecutor_Bounced => {
            var st = ReceiveExecutor_Storage.load();
            assert(in.senderAddress == st.owner, ReceiveExecutor_Error.Unauthorized);
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
    match (st.state) {
        ReceiveExecutor_MessageState.Untouched => {
            if (st.tokenAdminRegistry != null) { // This message has a token transfer
                // st.shouldOverrideGas = msg.gasOverride; // TODO
                val ccipSend = lazy st.message.load();
                // TODO data and token transfer not suported
                assert (ccipSend.data.beginParse().isEmpty()) throw ReceiveExecutor_Error.PTTNotSupported;
                
                return queryTokenAdminRegistry(mutate st, st.tokenAdminRegistry!.load());
            }
            execute(mutate st, msg.gasOverride);
        }
        ReceiveExecutor_MessageState.ExecuteFailed => execute(mutate st, msg.gasOverride),
        ReceiveExecutor_MessageState.TokenTransferFailed => {
            val rampMsg = lazy st.message.load();
            assert (rampMsg.tokenAmounts != null) throw ReceiveExecutor_Error.NoTokenAmountsInMessage;
            val token = rampMsg.tokenAmounts.getTokenTransfer(ReceiveExecutor_Error.UnsupportedNumberOfTokens);
            // TODO put conditional data such as tokenPool address in st.state
            val tokenPool = st.tokenPool!.load();
            releaseOrMint(mutate st, rampMsg, tokenPool, token);
        }
        ReceiveExecutor_MessageState.TokenAdminRegistryQuery => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
        ReceiveExecutor_MessageState.TokenTransfer => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
        ReceiveExecutor_MessageState.Execute => throw ReceiveExecutor_Error.ExecutionAlreadyInProgress,
        ReceiveExecutor_MessageState.Success =>  throw ReceiveExecutor_Error.MessageAlreadyExecuted,
    }
}

fun queryTokenAdminRegistry(mutate st: ReceiveExecutor_Storage, tokenAdminRegistry: address) {
    st.state = ReceiveExecutor_MessageState.TokenAdminRegistryQuery;
    createMessage(
        {
            bounce: true,
            value: 0,
            dest: tokenAdminRegistry,
            body: TokenRegistry_GetTokenInfo {
            }
        }
    ).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onTokenAdminRegistryResponse(mutate st: ReceiveExecutor_Storage, msg: TokenRegistry_ReturnTokenInfo) {
    assert(st.state == ReceiveExecutor_MessageState.TokenAdminRegistryQuery, ReceiveExecutor_Error.TokenAdminRegistryUnexpectedResponse);
    val rampMsg = lazy st.message.load();
    assert (rampMsg.tokenAmounts != null) throw ReceiveExecutor_Error.NoTokenAmountsInMessage;
    val token = rampMsg.tokenAmounts.getTokenTransfer(ReceiveExecutor_Error.UnsupportedNumberOfTokens);
    // TODO
    // if (msg.tokenPool == null) {
    //     throw ReceiveExecutor_Error.TokenNotEnabled; // TODO check what error is thrown in EVM
    // }
    st.tokenPool = msg.tokenPool!.toCell();
    releaseOrMint(mutate st, rampMsg, msg.tokenPool!, token);
}

fun releaseOrMint(mutate st: ReceiveExecutor_Storage, rampMsg: Any2TVMRampMessage, tokenPool: address, tokenAmount: Any2TVMTokenTransfer) {
    st.state = ReceiveExecutor_MessageState.TokenTransfer;
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
    st.state = ReceiveExecutor_MessageState.Execute;
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
    assert(st.state == ReceiveExecutor_MessageState.Execute, ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage);

    val ccipMessage = lazy st.message.load();

    assert (msg.receiver == ccipMessage.receiver, ReceiveExecutor_Error.NotificationFromInvalidReceiver);

    endExecutionSuccessfully(mutate st, ccipMessage.header);
}

fun onCCIPReceiveBounced(mutate st: ReceiveExecutor_Storage, msg: ReceiveExecutor_Bounced){
    assert(st.state == ReceiveExecutor_MessageState.Execute, ReceiveExecutor_Error.UpdatingStateOfNonExecutedMessage);

    val ccipMessage = lazy st.message.load();

    assert (msg.receiver == ccipMessage.receiver, ReceiveExecutor_Error.NotificationFromInvalidReceiver);

    st.state = ReceiveExecutor_MessageState.ExecuteFailed;
    endExecutionWithFailure(mutate st, ccipMessage.header);
}

fun endExecutionWithFailure(mutate st: ReceiveExecutor_Storage, messageHeader: RampMessageHeader) {
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

fun onReleaseOrMintFinished(mutate st: ReceiveExecutor_Storage, msg: TokenPool_ReleaseOrMintFinished) {
    assert(st.state == ReceiveExecutor_MessageState.TokenTransfer, ReceiveExecutor_Error.TokenPoolUnexpectedResponse);

    val ccipMessage = lazy st.message.load();
    if (ccipMessage.data.beginParse().isEmpty()) {
        return endExecutionSuccessfully(mutate st, ccipMessage.header);
    }
    // UNREACHABLE: onInitExecute should have thrown an error if there was any data in the message, so we should never get here.
    throw ReceiveExecutor_Error.PTTNotSupported;
    // TODO: PTT should execute after transfer
}

fun endExecutionSuccessfully(mutate st: ReceiveExecutor_Storage, messageHeader: RampMessageHeader) {
    st.state = ReceiveExecutor_MessageState.Success;

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

// TBD do we want to forward the TokenPool_ReleaseOrMintFailure.errorCode ?
fun onReleaseOrMintFailure(mutate st: ReceiveExecutor_Storage, _msg: TokenPool_ReleaseOrMintFailure) {
    assert(st.state == ReceiveExecutor_MessageState.TokenTransfer, ReceiveExecutor_Error.TokenPoolUnexpectedResponse);

    st.state = ReceiveExecutor_MessageState.TokenTransferFailed;
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
