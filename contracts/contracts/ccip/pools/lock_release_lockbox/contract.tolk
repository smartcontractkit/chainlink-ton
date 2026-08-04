// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
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

import "../lockbox/messages"

contract LockReleaseLockboxTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.LockReleaseLockboxTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | LockReleaseLockboxTokenPool_InMessage
}

fun onInternalMessage(in: InMessage): void {
    var st = Storage.load();
    var pool = loadPool(st);
    val handled = pool.onInternalMessage(in.senderAddress, in.valueCoins, in.body);
    if (handled) {
        st = pool.context != null ? pool.context! : st;
        st.poolData = pool.data.toCell();
        st.store();
        return;
    }

    val msg = lazy LockReleaseLockboxTokenPool_InMessage.fromSlice(in.body);
    match (msg) {
        JettonLockBox_Deposited => {
            onDeposited(mutate st, in.senderAddress, msg);
            st.store();
        }
        JettonLockBox_WithdrawFailed => {
            onWithdrawFailed(mutate st, in.senderAddress, msg);
            st.store();
        }
        ReturnExcessesBack => {
            onReturnExcessesBack(st, in.senderAddress, msg);
            st.store();
        }
        ContextExecutor_Reply<LockReleaseLockboxTokenPool_ReleaseContext> => {
            onContextExecutorReply(mutate st, in.senderAddress, msg);
            st.store();
        }
        ContextExecutor_ForwardNotification<LockReleaseLockboxTokenPool_ReleaseContext> => {
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
/// before sending the operational message to the lockbox, ensuring sequential execution.
/// @notice Deploys a ContextExecutor with an Ask message (empty forwardPayload).
/// The context is already embedded in the CE state from init, so forwardPayload is not needed.
/// @param executor The deterministic CE address to deploy.
/// @param queryId QueryId for correlation between Ask and Reply.
fun deployLockReleaseLockboxContextExecutor(
    executor: AutoDeployAddress,
    queryId: uint64,
): void {
    val deploy = createMessage({
        bounce: BounceMode.NoBounce,
        value: LockReleaseLockboxTokenPool_CONTEXT_EXECUTOR_DEPLOY_VALUE,
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
/// the reply fields, then sends the JettonLockBox_Withdraw operational message.
fun onContextExecutorReply(
    mutate st: Storage,
    sender: address,
    msg: ContextExecutor_Reply<LockReleaseLockboxTokenPool_ReleaseContext>,
) {
    // Validate CE identity: recompute address from reply fields and compare to sender.
    val expectedExecutor = ContextExecutor<LockReleaseLockboxTokenPool_ReleaseContext>.getAddress(
        st.contextExecutorCode,
        msg.id,
        contract.getAddress(),
        msg.context,
        msg.forwardFrom,
    );
    assert(sender == expectedExecutor.calculateAddress(), LockReleaseLockBoxTokenPool_Error.InvalidContextExecutorReply);

    val context = msg.context.load();
    val operation = context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();
    val requestIn = lazy operation.requestMsg.load().request.load();
    val details = lazy requestIn.transfer.details.load();

    // Return excesses are the successful withdrawal completion signal.
    val extra = JettonLockBox_WithdrawExtra {
        sendExcessesTo: sender,
        failureContext: context.toCell(),
    }.toCell();

    // Send JettonLockBox_Withdraw to the lockbox.
    val withdraw = createMessage({
        bounce: BounceMode.RichBounce,
        value: ton("0.1"),
        dest: st.lockbox,
        body: JettonLockBox_Withdraw {
            queryId: msg.queryId,
            token: st.poolData.load().jettonClient().masterAddress,
            remoteChainSelector: details.remoteChainSelector,
            amount: prepared.localAmount,
            recipientWallet: details.receiver,
            extra,
        },
    });
    withdraw.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// @notice Handles bounced lock (deposit) messages: returns jettons and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy LockReleaseLockboxTokenPool_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
        AskToTransfer => {
            var st = Storage.load();
            onLockTransferBounced(mutate st, in.senderAddress, msg);
            st.store();
        }
    }
}

/* === Lock (deposit) flow === */
/*
 * Flow:
 * 1. Router sends TokenPool_LockOrBurn + jettons via TransferNotificationForRecipient
 * 2. TokenPool library processes validation, calls onLockOrBurnTransferContinue
 * 3. We transfer jettons from our wallet to the lockbox
 * 4. Lockbox confirms the deposit directly to the pool
 * 5. The confirmation carries the lock context and we finalize
 */

fun onLockOrBurnTransferContinue(
    st: Storage,
    _sender: address,
    _msg: TransferNotificationForRecipient,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): Storage {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val prepared = lazy fwdPayload.prepared.load();

    val context = LockReleaseLockboxTokenPool_LockContext {
        forwardPayload: fwdPayload.toCell(),
    };

    // Calculate addresses.
    val jettonClient = st.poolData.load().jettonClient();
    val ownWallet = jettonClient.walletAddress();

    // Build JettonLockBox_Deposit using generated struct (avoids manual encoding issues).
    // Navigate: requestMsg (TokenPool_LockOrBurn) -> request (TokenPool_LockOrBurnInV1) -> transfer -> details.
    val requestInV1 = lazy requestMsg.request.load();
    val requestDetails = lazy requestInV1.transfer.details.load();
    val depositMsg = JettonLockBox_Deposit {
        queryId: requestMsg.queryId,
        token: jettonClient.masterAddress,
        remoteChainSelector: requestDetails.remoteChainSelector,
        amount: prepared.destTokenAmount,
        context: context.toCell(),
    };

    // Wrap deposit message in forwardPayload cell (flag + ref, same pattern as lockbox uses).
    val depositCell = depositMsg.toCell();
    val forwardPayload = beginCell()
        .storeBool(true)
        .storeRef(depositCell)
        .endCell()
        .beginParse();

    // Transfer jettons from our wallet to the lockbox wallet.
    // The CCT JettonWallet treats transferRecipient as an owner address and
    // computes the wallet from it, so we pass the lockbox owner (not wallet) address.
    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: ton("0.1"),
        dest: ownWallet,
        body: AskToTransfer {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount,
            transferRecipient: st.lockbox,
            sendExcessesTo: contract.getAddress(),
            customPayload: context.toCell(),
            forwardTonAmount: 0,
            forwardPayload: forwardPayload,
        },
    });
    transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);

    return st;
}

/* --- Bounced AskToTransfer during lock --- */

fun onDeposited(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_Deposited,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(msg.context != null, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    val context = lazy LockReleaseLockboxTokenPool_LockContext.fromCell(msg.context!);
    assert(msg.queryId == context.forwardPayload.load().requestMsg.load().queryId) throw 0xFFFF;
    var pool = loadPool(st);
    pool.onLockOrBurnTransferFinalize(context.forwardPayload.load());
}

fun onLockTransferBounced(
    mutate st: Storage,
    sender: address,
    msg: AskToTransfer,
) {
    assert(st.poolData.load().jettonClient().isWallet(sender)) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
    assert(msg.customPayload != null) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
    val context = lazy LockReleaseLockboxTokenPool_LockContext.fromCell(msg.customPayload!);
    val operation = context.forwardPayload.load();
    returnLockOrBurnTransfer(st, operation);
    var pool = loadPool(st);
    pool.sendLockOrBurnFailure(operation, LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce as uint16);
}

/* === Release (withdraw) flow === */
/*
 * Flow:
 * 1. Router sends TokenPool_ReleaseOrMint
 * 2. TokenPool library validates, calls onReleaseOrMintContinue
 * 3. We retain the direct lockbox-failure context and deploy an executor for success
 * 4. Lockbox sends AskToTransfer to jetton wallet
 * 5. Jetton wallet transfers to recipient, then sends ReturnExcessesBack to the executor
 * 6. The executor forwards context and we finalize the release
 * 7. On error, the lockbox sends JettonLockBox_WithdrawFailed directly to the pool
 */

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx!;
    assert(st.canTakeContextExecutorNextId()) throw LockReleaseLockBoxTokenPool_Error.ContextExecutorUnavailable;
    assert(st.lockbox != createAddressNone(), LockReleaseLockBoxTokenPool_Error.LockboxNotConfigured);

    val jettonClient = st.poolData.load().jettonClient();

    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();

    // The CCT JettonWallet treats transferRecipient as an owner address and
    // computes the wallet from it, so we pass the raw receiver (owner) address
    // to the lockbox. The lockbox forwards it as transferRecipient in AskToTransfer,
    // and the CCT wallet correctly computes the recipient's jetton wallet.
    // We still need the computed wallet address for the executor's forwardFrom list
    // because ReturnExcessesBack comes from the recipient's wallet.
    val recipientWallet = calcAddressOfJettonWallet(
        details.receiver,
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };
    val context = LockReleaseLockboxTokenPool_ReleaseContext {
        forwardPayload: forwardPayload.toCell(),
    };
    val contextExecutorId = st.takeContextExecutorNextId();
    // ReturnExcessesBack comes from the recipient's jetton wallet (which processes
    // the InternalTransferStep and sends excesses back to sendExcessesTo).
    val executor = ContextExecutor<LockReleaseLockboxTokenPool_ReleaseContext>.getAddress(
        st.contextExecutorCode,
        contextExecutorId,
        contract.getAddress(),
        context.toCell(),
        [recipientWallet],
    );

    // Deploy CE with Ask — context is already in CE state from init.
    // The operational message (JettonLockBox_Withdraw) is sent after CE confirms.
    deployLockReleaseLockboxContextExecutor(executor, msg.queryId);

    return st;
}

fun onReleaseOrMint(st: Storage, _msg: TokenPool_ReleaseOrMint): Storage {
    assert(st.canTakeContextExecutorNextId()) throw LockReleaseLockBoxTokenPool_Error.ContextExecutorUnavailable;
    return st;
}

fun onWithdrawFailed(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_WithdrawFailed,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(msg.context != null, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(msg.context!);
    assert(msg.queryId == context.forwardPayload.load().requestMsg.load().queryId) throw 0xFFFF;
    var pool = loadPool(st);
    pool.sendReleaseOrMintFailure(context.forwardPayload.load(), TokenPool_Error.UnsupportedOperation as uint16);
}

fun onReturnExcessesBack(
    _st: Storage,
    _sender: address,
    _msg: ReturnExcessesBack,
) {
    // Lock-transfer excesses are unrelated to completion. Release excesses are
    // routed to a Context Executor and never complete directly at the pool.
}

/// @notice Handles ForwardNotification from ContextExecutor after release (withdraw) completion.
/// Verifies executor identity, then emits event and sends ReleaseOrMintFinished reply.
fun onContextExecutorForwardNotification(
    mutate st: Storage,
    sender: address,
    msg: ContextExecutor_ForwardNotification<LockReleaseLockboxTokenPool_ReleaseContext>,
) {
    val expectedExecutor = ContextExecutor<LockReleaseLockboxTokenPool_ReleaseContext>.getAddress(
        st.contextExecutorCode,
        msg.id,
        contract.getAddress(),
        msg.context,
        msg.forwardFrom,
    );
    assert(sender == expectedExecutor.calculateAddress(), TokenPool_Error.Unauthorized);

    val forwarded = msg.message.load();
    val returnExcesses = ReturnExcessesBack.fromCell(forwarded.body);
    val operation = msg.context.load().forwardPayload.load();
    assert(returnExcesses.queryId == operation.requestMsg.load().queryId) throw 0xFFFF;

    var pool = loadPool(st);
    pool.sendReleaseOrMintFinished(operation);
}

/// @notice Returns jettons to the original sender after a failed lock (deposit) operation.
/// @dev Sends AskToTransfer to the pool's jetton wallet with original sender as recipient.
fun returnLockOrBurnTransfer(st: Storage, forwardPayload: TokenPool_LockOrBurnForwardPayload) {
    val requestMsg = lazy forwardPayload.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    val returnTransfer = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: st.poolData.load().jettonClient().walletAddress(),
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
    returnTransfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/* === Pool loader === */

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
            onLockOrBurnTransferContinue,
            onReleaseOrMint,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
        },
    };
}

/* === Getters === */

get fun typeAndVersion(): (slice, slice) {
    return (LockReleaseLockboxTokenPool_CONTRACT_NAME, LockReleaseLockboxTokenPool_CONTRACT_VERSION);
}

get fun token(): address {
    return Storage.load().poolData.load().token();
}

get fun tokenDecimals(): uint8 {
    return Storage.load().poolData.load().tokenDecimals;
}

get fun lockbox(): address {
    return Storage.load().lockbox;
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
    val ac = Storage.load().poolData.load().adminConfig.load();
    return ac.allowedFinalityConfig;
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
