// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton-utils"
import "../../../lib/jetton/jetton_client"
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

contract LockReleaseTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.LockReleaseTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | LockReleaseTokenPool_InMessage
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

    val msg = lazy LockReleaseTokenPool_InMessage.fromSlice(in.body);
    match (msg) {
        ContextExecutor_Reply<LockReleaseTokenPool_ReleaseContext> => {
            onContextExecutorReply(mutate st, in.senderAddress, msg);
            st.store();
        }
        ContextExecutor_ForwardNotification<LockReleaseTokenPool_ReleaseContext> => {
            onContextExecutorForwardNotification(mutate st, in.senderAddress, msg);
            st.store();
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// @notice Deploys a new ContextExecutor with an Ask message.
/// The Ask carries the release context in forwardPayload. The pool awaits the Reply
/// before sending the operational transfer message, ensuring sequential execution.
/// @notice Deploys a ContextExecutor with an Ask message (empty forwardPayload).
/// The context is already embedded in the CE state from init, so forwardPayload is not needed.
/// @param executor The deterministic CE address to deploy.
/// @param queryId QueryId for correlation between Ask and Reply.
fun deployLockReleaseContextExecutor(
    executor: AutoDeployAddress,
    queryId: uint64,
): void {
    val deploy = createMessage({
        bounce: BounceMode.NoBounce,
        value: LockReleaseTokenPool_CONTEXT_EXECUTOR_DEPLOY_VALUE,
        dest: executor,
        body: ContextExecutor_Ask {
            queryId: queryId,
            forwardPayload: null,
            done: false,
        },
    });
    deploy.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// @notice Validates a ContextExecutor_Reply by recomputing the expected CE address from
/// the reply fields, then sends the AskToTransfer operational message.
fun onContextExecutorReply(
    mutate st: Storage,
    sender: address,
    msg: ContextExecutor_Reply<LockReleaseTokenPool_ReleaseContext>,
) {
    // Validate CE identity: recompute address from reply fields and compare to sender.
    val expectedExecutor = ContextExecutor<LockReleaseTokenPool_ReleaseContext>.getAddress(
        st.contextExecutorCode,
        msg.id,
        contract.getAddress(),
        msg.context,
        msg.forwardFrom,
    );
    val executorAddr = expectedExecutor.calculateAddress();
    assert(sender == executorAddr, Error.InvalidContextExecutorReply);

    val context = lazy msg.context.load();
    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();
    val requestIn = lazy operation.requestMsg.load().request.load();
    val details = lazy requestIn.transfer.details.load();

    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.poolData.load().jettonClient().walletAddress(),
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: prepared.localAmount,
            transferRecipient: details.receiver,
            sendExcessesTo: executorAddr, // continuation
            customPayload: context.toCell(),
            forwardTonAmount: 0, // TODO: do we notify the receiver?
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// @notice Handles bounced release messages: refunds rate limit and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    var st = Storage.load();
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy LockReleaseTokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        AskToTransfer => {
            onReleaseTransferBounced(mutate st, in.senderAddress, msg);
            st.store();
        }
    }
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

    val context = LockReleaseTokenPool_ReleaseContext {
        forwardPayload: forwardPayload.toCell(),
    };
    val contextExecutorId = st.takeContextExecutorNextId();
    val executor = ContextExecutor<LockReleaseTokenPool_ReleaseContext>.getAddress(
        st.contextExecutorCode,
        contextExecutorId,
        contract.getAddress(),
        context.toCell(),
        [recipientWallet],
    );

    // Deploy CE with Ask — context is already in CE state from init.
    // The operational message (AskToTransfer) is sent after CE confirms.
    deployLockReleaseContextExecutor(executor, msg.queryId);

    return st;
}

fun onReleaseOrMint(st: Storage, _msg: TokenPool_ReleaseOrMint): Storage {
    assert(st.canTakeContextExecutorNextId()) throw Error.ContextExecutorUnavailable;
    return st;
}

fun onReleaseTransferBounced(
    mutate st: Storage,
    sender: address,
    msg: AskToTransfer,
) {
    assert(st.poolData.load().jettonClient().isWallet(sender)) throw Error.UnexpectedReleaseBounce;
    assert(msg.customPayload != null) throw Error.UnexpectedReleaseBounce;

    val context = lazy LockReleaseTokenPool_ReleaseContext.fromCell(msg.customPayload!);
    val operation = context.forwardPayload.load();
    var pool = loadPool(st);
    pool.refundReleaseOrMintRateLimit(operation);
    st.poolData = pool.data.toCell();
    pool.sendReleaseOrMintFailure(operation, Error.UnexpectedReleaseBounce as uint16);
}

/// @notice Handles ForwardNotification from ContextExecutor after release completion.
/// Verifies executor identity, then emits event and sends ReleaseOrMintFinished reply.
fun onContextExecutorForwardNotification(
    mutate st: Storage,
    sender: address,
    msg: ContextExecutor_ForwardNotification<LockReleaseTokenPool_ReleaseContext>,
) {
    val expectedExecutor = ContextExecutor<LockReleaseTokenPool_ReleaseContext>.getAddress(
        st.contextExecutorCode,
        msg.id,
        contract.getAddress(),
        msg.context,
        msg.forwardFrom,
    );
    assert(sender == expectedExecutor.calculateAddress(), TokenPool_Error.Unauthorized);

    val forwarded = lazy msg.message.load();
    // Check that the forwarded message is expected
    val _returnExcesses = ReturnExcessesBack.fromCell(forwarded.body);

    val context = lazy msg.context.load();
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.sendReleaseOrMintFinished(operation);
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
            onLockOrBurnTransfer: null,
            onLockOrBurnTransferContinue: null,
            onReleaseOrMint,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
        },
    };
}

get fun typeAndVersion(): (slice, slice) {
    return (LockReleaseTokenPool_CONTRACT_NAME, LockReleaseTokenPool_CONTRACT_VERSION);
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
    return Storage.load().poolData.load().adminConfig.load().ownable.load().get_owner();
}

get fun pendingOwner(): address? {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().get_pendingOwner();
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
    return pool.getAdvancedPoolHooks()  ;
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
