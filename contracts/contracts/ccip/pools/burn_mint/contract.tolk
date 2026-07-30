// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/jetton-utils"
import "../../common/types"
import "../../executors/context_executor/messages"
import "../../executors/context_executor/types"
import "../../rmn_remote/lib"
import "../lib/token_pool/entrypoint"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/events"
import "../lib/token_pool/errors"

import "messages"
import "types"
import "errors"
import "storage"

contract BurnMintTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.BurnMintTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | BurnMintTokenPool_InMessage
}

fun onInternalMessage(in: InMessage) {
    var st = Storage.load();
    var pool = loadPool(st);
    val handled = pool.onInternalMessage(in.senderAddress, in.valueCoins, in.body);
    if (handled) {
        st = pool.context != null ? pool.context! : st;
        st.poolData = pool.data.toCell();
        st.store();
        return;
    }

    val msg = lazy BurnMintTokenPool_InMessage.fromSlice(in.body);
    match (msg) {
        BurnMintTokenPool_ClaimMinterAdmin => {
            onClaimMinterAdmin(mutate st, in.senderAddress, msg.queryId);
            st.store();
        }
        ContextExecutor_ForwardNotification<BurnMintTokenPool_ContextExecutorContext> => {
            onContextExecutorForwardNotification(mutate st, in.senderAddress, msg);
            st.store();
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun deployBurnMintContextExecutor(executor: AutoDeployAddress): void {
    val deploy = createMessage({
        bounce: BounceMode.NoBounce,
        value: BurnMintTokenPool_CONTEXT_EXECUTOR_DEPLOY_VALUE,
        dest: executor,
        body: beginCell().endCell().beginParse(),
    });
    deploy.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onBouncedMessage(in: InMessageBounced) {
    val st = Storage.load();
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy BurnMintTokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        AskToBurn => {
            assert(msg.customPayload != null) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;
            val context = lazy BurnMintTokenPool_BurnContext.fromCell(msg.customPayload!);
            assert(in.senderAddress == context.wallet) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;

            val operation = context.forwardPayload.load();
            var mutableSt = st;
            refundLockOrBurnRateLimit(mutate mutableSt, operation);
            mutableSt.store();
            sendLockOrBurnFailure(operation, BurnMintTokenPool_Error.UnexpectedBurnBounce as uint16);
        }
        MintNewJettons => {
            assert(in.senderAddress == st.poolData.load().jettonClient().masterAddress) throw BurnMintTokenPool_Error.UnexpectedMintBounce;
            val internalTransfer = lazy msg.internalTransferMsg.load();
            val contextCell = loadForwardPayloadAsCell(internalTransfer.forwardPayload);
            assert(contextCell != null) throw BurnMintTokenPool_Error.UnexpectedMintBounce;
            val context = lazy BurnMintTokenPool_MintContext.fromCell(contextCell!);

            val operation = context.forwardPayload.load();
            var mutableSt = st;
            refundReleaseOrMintRateLimit(mutate mutableSt, operation);
            mutableSt.store();
            sendReleaseOrMintFailure(operation, BurnMintTokenPool_Error.UnexpectedMintBounce as uint16);
        }
    }
}

/// @notice Token pool used for burn and mint tokens. This uses a burn and mint mechanism.
/// @dev One token per BurnMintTokenPool. In this variant the pool contract owns the Jetton wallet and the Jetton minter admin role.
fun onLockOrBurnTransferContinue(
    st: Storage,
    sender: address,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): Storage {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val jettonClient = st.poolData.load().jettonClient();
    val context = BurnMintTokenPool_BurnContext {
        wallet: sender,
        forwardPayload: fwdPayload.toCell(),
    };
    val contextExecutorId = st.takeContextExecutorNextId();
    val executor = ContextExecutor<BurnMintTokenPool_BurnContext>.getAddress(
        st.contextExecutorCode,
        contextExecutorId,
        contract.getAddress(),
        context.toCell(),
        [jettonClient.masterAddress],
    );

    deployBurnMintContextExecutor(executor);

    val prepared = lazy fwdPayload.prepared.load();
    val burnMsg = createMessage({
        bounce: BounceMode.RichBounce,
        value: BurnMintTokenPool_BURN_VALUE,
        dest: sender,
        body: AskToBurn {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount,
            sendExcessesTo: executor.calculateAddress(),
            customPayload: context.toCell(),
        },
    });
    burnMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);

    return st;
}

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx!;
    val jettonClient = st.poolData.load().jettonClient();
    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();
    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val recipientWallet = calcAddressOfJettonWallet(
        details.receiver,
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    val context = BurnMintTokenPool_MintContext {
        forwardPayload: forwardPayload.toCell(),
    };
    val contextExecutorId = st.takeContextExecutorNextId();
    val executor = ContextExecutor<BurnMintTokenPool_MintContext>.getAddress(
        st.contextExecutorCode,
        contextExecutorId,
        contract.getAddress(),
        context.toCell(),
        [recipientWallet],
    );

    deployBurnMintContextExecutor(executor);

    val mint = createMessage({
        bounce: BounceMode.RichBounce,
        value: BurnMintTokenPool_MINT_VALUE,
        dest: jettonClient.masterAddress,
        body: MintNewJettons {
            queryId: msg.queryId,
            mintRecipient: details.receiver,
            tonAmount: BurnMintTokenPool_MINT_VALUE,
            internalTransferMsg: InternalTransferStep {
                queryId: msg.queryId,
                jettonAmount: prepared.localAmount,
                transferInitiator: null,
                sendExcessesTo: executor.calculateAddress(),
                forwardTonAmount: 0,
                forwardPayload: beginCell().storeBool(true).storeRef(context.toCell()).endCell().beginParse(),
            }.toCell(),
        },
    });
    mint.send(SEND_MODE_PAY_FEES_SEPARATELY);

    return st;
}

fun onLockOrBurnTransfer(
    st: Storage,
    _sender: address,
    _msg: TransferNotificationForRecipient,
): Storage {
    assert(st.canTakeContextExecutorNextId()) throw BurnMintTokenPool_Error.ContextExecutorUnavailable;
    return st;
}

fun onReleaseOrMint(st: Storage, _msg: TokenPool_ReleaseOrMint): Storage {
    assert(st.canTakeContextExecutorNextId()) throw BurnMintTokenPool_Error.ContextExecutorUnavailable;
    return st;
}

fun refundLockOrBurnRateLimit(
    mutate st: Storage,
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();
    var pool = loadPool(st);
    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        pool.releaseFastFinalityOutboundRateLimit(details.remoteChainSelector, prepared.destTokenAmount);
    } else {
        pool.releaseOutboundRateLimit(details.remoteChainSelector, prepared.destTokenAmount);
    }
    st.poolData = pool.data.toCell();
}

fun refundReleaseOrMintRateLimit(
    mutate st: Storage,
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload,
) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();
    var pool = loadPool(st);
    if (requestMsg.requestedFinalityConfig != TOKEN_POOL_WAIT_FOR_FINALITY_FLAG) {
        pool.releaseFastFinalityInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    } else {
        pool.releaseInboundRateLimit(details.remoteChainSelector, prepared.localAmount);
    }
    st.poolData = pool.data.toCell();
}

fun sendLockOrBurnFailure(
    forwardPayload: TokenPool_LockOrBurnForwardPayload,
    errorCode: uint16,
) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    if (requestMsg.replyTo != null) {
        val fail = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_LockOrBurnFailure {
                queryId: requestMsg.queryId,
                errorCode,
            },
        });
        fail.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

fun returnLockOrBurnTransfer(sender: address, forwardPayload: TokenPool_LockOrBurnForwardPayload) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val returnTransfer = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: AskToTransfer {
            queryId: requestMsg.queryId,
            jettonAmount: details.amount,
            transferRecipient: details.originalSender,
            sendExcessesTo: details.originalSender,
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    returnTransfer.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun sendReleaseOrMintFinished(forwardPayload: TokenPool_ReleaseOrMintForwardPayload) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val prepared = lazy forwardPayload.prepared.load();
    val out = prepared.out;

    emit(TOPIC_TOKEN_POOL_RELEASED_OR_MINTED, TokenPool_ReleasedOrMinted {
        remoteChainSelector: details.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: details.localToken,
            sender: contract.getAddress(),
            amount: out.destinationAmount,
            recipient: details.receiver.toCell(),
        }.toCell(),
    });

    if (requestMsg.replyTo != null) {
        val notify = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_ReleaseOrMintFinished {
                queryId: requestMsg.queryId,
                out: prepared.out.toCell(),
            },
        });
        notify.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

fun sendReleaseOrMintFailure(
    forwardPayload: TokenPool_ReleaseOrMintForwardPayload,
    errorCode: uint16,
) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    if (requestMsg.replyTo != null) {
        val fail = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_ReleaseOrMintFailure {
                queryId: requestMsg.queryId,
                errorCode,
            },
        });
        fail.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

fun onClaimMinterAdmin(
    mutate st: Storage,
    sender: address,
    queryId: uint64,
) {
    st.poolData.load().adminConfig.load().ownable.load().requireOwner(sender);

    val claim = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: BurnMintTokenPool_CLAIM_ADMIN_VALUE,
        dest: st.poolData.load().token(),
        body: ClaimMinterAdmin { queryId },
    });
    claim.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onContextExecutorForwardNotification(
    mutate st: Storage,
    sender: address,
    msg: ContextExecutor_ForwardNotification<BurnMintTokenPool_ContextExecutorContext>,
) {
    val expectedExecutor = ContextExecutor<BurnMintTokenPool_ContextExecutorContext>.getAddress(
        st.contextExecutorCode,
        msg.id,
        contract.getAddress(),
        msg.context,
        msg.forwardFrom,
    );
    assert(sender == expectedExecutor.calculateAddress(), TokenPool_Error.Unauthorized);

    val forwarded = msg.message.load();
    val returnExcesses = ReturnExcessesBack.fromCell(forwarded.body);

    val context = msg.context.load();
    match (context) {
        BurnMintTokenPool_BurnContext => {
            val operation = context.forwardPayload.load();
            assert(returnExcesses.queryId == operation.requestMsg.load().queryId) throw 0xFFFF;

            var pool = loadPool(st);
            pool.onLockOrBurnTransferFinalize(operation);
            st.poolData = pool.data.toCell();

            return;
        }
        BurnMintTokenPool_MintContext => {
            val operation = context.forwardPayload.load();
            assert(returnExcesses.queryId == operation.requestMsg.load().queryId) throw 0xFFFF;

            sendReleaseOrMintFinished(operation);
        }
    }
}

fun loadPool(st: Storage): TokenPool<Storage> {
    return TokenPool<Storage> {
        data: st.poolData.load(),
        context: st,
        hooks: TokenPool_Hooks<Storage> {
            ensureOutboundAccess: null,
            ensureInboundAccess: null,
            ensureNotCursed: null,
            onLockOrBurn: null,
            validateLockOrBurn: null,
            preflightCheck: null,
            onLockOrBurnTransfer,
            onLockOrBurnTransferContinue,
            onReleaseOrMint,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
        },
    };
}

get fun typeAndVersion(): (slice, slice) {
    return (BurnMintTokenPool_CONTRACT_NAME, BurnMintTokenPool_CONTRACT_VERSION);
}

get fun token(): address {
    return Storage.load().poolData.load().token();
}

get fun tokenDecimals(): uint8 {
    return Storage.load().poolData.load().tokenDecimals;
}

get fun isSupportedChain(remoteChainSelector: uint64): bool {
    return Storage.load().poolData.load().remoteChainConfigs.get(remoteChainSelector).isFound;
}

get fun onRamp(remoteChainSelector: uint64): address? {
    val entry = Storage.load().poolData.load().mirroredPolicy.load().onRamps.get(remoteChainSelector);
    return entry.isFound ? entry.loadValue() : null;
}

get fun offRamp(remoteChainSelector: uint64): address? {
    val entry = Storage.load().poolData.load().mirroredPolicy.load().offRamps.get(remoteChainSelector);
    return entry.isFound ? entry.loadValue() : null;
}

get fun getRMNProxy(): address {
    return Storage.load().poolData.load().adminConfig.load().rmnProxy;
}

get fun verifyNotCursed(subject: uint128): bool {
    return !Storage.load().poolData.load().mirroredPolicy.load().cursedSubjects.isCursed(subject);
}

get fun owner(): address {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().owner;
}

/// Returns the outbound and inbound rate limiter state for the given remote chain at the time of the call.
/// @param remoteChainSelector The remote chain selector.
/// @param fastFinality Whether to get the fast finality rate limiter state.
get fun getCurrentRateLimiterState(remoteChainSelector: uint64, fastFinality: bool): TokenPool_RateLimiterPair {
    val pool = loadPool(Storage.load());
    return pool.getCurrentRateLimiterState(remoteChainSelector, fastFinality);
}

/// Returns whether the given token address is supported by this pool.
get fun isSupportedToken(token: address): bool {
    val pool = loadPool(Storage.load());
    return pool.isSupportedToken(token);
}

/// Returns the pool's dynamic configuration (router, rateLimitAdmin, feeAdmin).
get fun getDynamicConfig(): TokenPool_DynamicConfig {
    val pool = loadPool(Storage.load());
    return pool.getDynamicConfig();
}

/// Returns the finality config as defined in the FinalityCodec library.
get fun getAllowedFinalityConfig(): uint32 {
    val pool = loadPool(Storage.load());
    return pool.getAllowedFinalityConfig();
}

/// Returns the advanced pool hooks contract address, or null if not set.
get fun getAdvancedPoolHooks(): address? {
    val pool = loadPool(Storage.load());
    return pool.getAdvancedPoolHooks();
}

/// Returns the list of supported remote chain selectors.
get fun getSupportedChains(): lisp_list<uint64> {
    val pool = loadPool(Storage.load());
    return pool.getSupportedChains();
}

/// Checks if the given remote pool address is configured for the given remote chain.
get fun isRemotePool(remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool {
    val pool = loadPool(Storage.load());
    return pool.isRemotePool(remoteChainSelector, remotePoolAddress);
}

/// Returns the remote token address for the given remote chain.
get fun getRemoteToken(remoteChainSelector: uint64): Cell<CrossChainAddress> {
    val pool = loadPool(Storage.load());
    return pool.getRemoteToken(remoteChainSelector);
}

/// Returns the list of remote pool addresses for the given remote chain.
get fun getRemotePools(remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>> {
    val pool = loadPool(Storage.load());
    return pool.getRemotePools(remoteChainSelector);
}

/// Returns the token transfer fee configuration for the given destination chain selector.
get fun getTokenTransferFeeConfig(destChainSelector: uint64): TokenPool_TokenTransferFeeConfig? {
    val pool = loadPool(Storage.load());
    return pool.getTokenTransferFeeConfig(destChainSelector);
}

/// Returns the fee parameters that will apply to a transfer to the given destination chain.
/// @param localToken The local token address.
/// @param destChainSelector The destination chain selector.
/// @param amount The transfer amount.
/// @param feeToken The fee token address.
/// @param requestedFinalityConfig The requested finality encoding.
/// @param tokenArgs Optional token-specific arguments.
get fun getFee(
    localToken: address,
    destChainSelector: uint64,
    amount: coins,
    feeToken: address,
    requestedFinalityConfig: uint32,
    tokenArgs: cell?,
): (coins, uint32, uint32, uint16, bool) {
    val pool = loadPool(Storage.load());
    return pool.getFee(localToken, destChainSelector, amount, feeToken, requestedFinalityConfig, tokenArgs);
}

/// Calculates the fee amount based on the transfer details and finality config.
get fun getFeeAmount(
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): coins {
    val pool = loadPool(Storage.load());
    return pool.getFeeAmount(transfer, requestedFinalityConfig);
}
