// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/jetton-utils"
import "../../common/types"
import "../../accounts/deposit/messages"
import "../../accounts/deposit/types"
import "../../rmn_remote/lib"
import "../lib/token_pool/entrypoint"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
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
        DepositAccount_Reply => {
            onDepositAccountReply(mutate st, in.senderAddress, msg);
            st.store();
        }
        DepositAccount_ForwardNotification => {
            onDepositAccountForwardNotification(mutate st, in.senderAddress, msg);
            st.store();
        }
        ReturnExcessesBack => {
            // Excess TON from jetton transfer — just keep the coins.
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Deploys a DepositAccount (off-ramp role) for release operations.
/// owner = recipient (can withdraw jettons), proxy = pool.
/// allowedJettonWallet = account's own jetton wallet (notifications come from here).
fun deployOffRampAccountWithRelease(
    st: Storage,
    recipient: address,
    queryId: uint64,
    context: LockReleaseLockboxTokenPool_ReleaseContext,
) {
    val jettonClient = st.poolData.load().jettonClient();
    var beneficiaries: map<address, bool> = [];
    beneficiaries.set(recipient, true);
    val oaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        recipient,
        contract.getAddress(),
        beneficiaries,
    );

    // Account's own CCT jetton wallet — the destination wallet that sends TransferNotification.
    // When lockbox sends AskToTransfer with transferRecipient=account, the CCT wallet
    // computes account's wallet as destination, then THAT wallet sends TransferNotification to account.
    val oaaWallet = calcAddressOfJettonWallet(
        oaa.calculateAddress(),
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    val deploy = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: oaa,
        body: DepositAccount_Init {
            queryId,
            allowedJettonWallet: oaaWallet,
            forwardPayload: context.toCell(),
        },
    });
    deploy.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handles DepositAccount_Reply after account deployment for release.
/// Extracts context from Reply forwardPayload, then sends JettonLockBox_Withdraw to the lockbox.
/// The lockbox withdraws to the account's jetton wallet, which forwards the notification via account to pool.
fun onDepositAccountReply(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_Reply,
) {
    // Extract release context from Reply forwardPayload.
    assert(msg.forwardPayload != null, LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountReply);
    val contextCell = msg.forwardPayload!;
    val context = LockReleaseLockboxTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();
    val requestIn = lazy operation.requestMsg.load().request.load();
    val details = lazy requestIn.transfer.details.load();

    // Validate sender: derive expected account address and verify.
    var beneficiaries: map<address, bool> = [];
    beneficiaries.set(details.receiver, true);
    val expectedOaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        details.receiver,
        contract.getAddress(),
        beneficiaries,
    );
    assert(sender == expectedOaa.calculateAddress(), LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountReply);

    // Compute account's jetton wallet address (where lockbox should withdraw to).
    val jettonClient = st.poolData.load().jettonClient();

    // Build extra with sendExcessesTo so ReturnExcessesBack routes to pool.
    // Also pass release context as forwardPayload so it survives the lockbox → jetton wallet hop.
    val withdrawExtra = JettonLockBox_WithdrawExtra {
        sendExcessesTo: contract.getAddress(),
        failureContext: null,
        forwardTonAmount: ton("0.01"), // required for TransferNotificationForRecipient
        forwardPayload: contextCell,
    };

    // Send JettonLockBox_Withdraw to the lockbox.
    // The lockbox sends AskToTransfer from its jetton wallet to account's jetton wallet.
    // Account's wallet sends TransferNotification to account, which forwards to pool.
    val withdraw = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.lockbox,
        body: JettonLockBox_Withdraw {
            queryId: msg.queryId,
            token: jettonClient.masterAddress,
            remoteChainSelector: details.remoteChainSelector,
            amount: prepared.localAmount,
            recipientWallet: sender, // account address
            extra: withdrawExtra.toCell(),
        },
    });
    withdraw.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Handles bounced lock (deposit) messages: returns jettons and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy LockReleaseLockboxTokenPool_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
        AskToTransfer => {
            var st = Storage.load();
            onLockTransferBounced(mutate st, in.senderAddress, msg);
            st.store();
        }
        // The account rejected init (e.g. could not fund its rent reserve). Refund the rate limit and
        // reply with a failure so the sender can retry instead of the release silently stalling.
        DepositAccount_Init => {
            var st = Storage.load();
            onDepositAccountInitBounced(mutate st, in.senderAddress, msg);
            st.store();
        }
    }
}

/// @notice Handles a bounced `DepositAccount_Init`: refunds the inbound rate limit and sends a
/// release failure reply. The init carries the release context in `forwardPayload`.
fun onDepositAccountInitBounced(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_Init,
) {
    assert(msg.forwardPayload != null, LockReleaseLockBoxTokenPool_Error.OffRampAccountDeployFailed);
    val context = LockReleaseLockboxTokenPool_ReleaseContext.fromCell(msg.forwardPayload!);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.refundReleaseOrMintRateLimit(operation);
    st.poolData = pool.data.toCell();
    pool.sendReleaseOrMintFailure(operation, LockReleaseLockBoxTokenPool_Error.OffRampAccountDeployFailed as uint16);
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

    // Transfer jettons from our wallet to the lockbox wallet.
    // The CCT JettonWallet treats transferRecipient as an owner address and
    // computes the wallet from it, so we pass the lockbox owner (not wallet) address.
    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: ownWallet,
        body: AskToTransfer {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount,
            transferRecipient: st.lockbox,
            sendExcessesTo: contract.getAddress(),
            customPayload: context.toCell(),
            // TODO: should be calculated as the leftover value after some fixed cost
            forwardTonAmount: ton("0.01"), // TODO: make dynamic, required for TransferNotificationForRecipient
            forwardPayload: beginCell()
                .storeMaybeRef(depositMsg.toCell())
                .endCell()
                .beginParse(),
        },
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

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
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.returnTransferLocked(operation);
    // The outbound rate limit was consumed at admission. Since the lock/deposit failed and
    // custody is being returned, release the consumed capacity mirroring burn_mint semantics.
    pool.refundLockOrBurnRateLimit(operation);
    st.poolData = pool.data.toCell();
    pool.sendLockOrBurnFailure(operation, LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce as uint16);
}

/* === Release (withdraw) flow === */
/*
 * Flow:
 * 1. Router sends TokenPool_ReleaseOrMint
 * 2. TokenPool library validates, calls onReleaseOrMintContinue
 * 3. We deploy OffRampAccount (OAA) for the recipient
 * 4. On OAA Reply, we send JettonLockBox_Withdraw to the lockbox
 * 5. Lockbox sends AskToTransfer from its jetton wallet to OAA's jetton wallet
 * 6. OAA's jetton wallet sends TransferNotificationForRecipient to OAA
 * 7. OAA forwards to pool, we validate transferInitiator = lockbox wallet, then finalize
 * 8. On error, the lockbox sends JettonLockBox_WithdrawFailed directly to the pool
 */

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx!;
    assert(st.lockbox != createAddressNone(), LockReleaseLockBoxTokenPool_Error.LockBoxNotConfigured);

    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();
    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val context = LockReleaseLockboxTokenPool_ReleaseContext {
        forwardPayload: forwardPayload.toCell(),
    };

    // Deploy OffRampAccount with context embedded.
    // OAA owner = recipient (can withdraw released jettons).
    deployOffRampAccountWithRelease(
        st,
        details.receiver,
        msg.queryId,
        context,
    );

    return st;
}

fun onWithdrawFailed(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_WithdrawFailed,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    // JettonLockBox_WithdrawFailed may or may not carry context depending on when it failed.
    // If context is present, use it to send a failure reply to the original requester.
    if (msg.context != null) {
        val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(msg.context!);
        assert(msg.queryId == context.forwardPayload.load().requestMsg.load().queryId) throw 0xFFFF;
        var pool = loadPool(st);
        pool.sendReleaseOrMintFailure(context.forwardPayload.load(), LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed as uint16);
    }
}

/// Handles ForwardNotification from DepositAccount after release (withdraw) completion.
/// The forwarded message body contains TransferNotificationForRecipient.
/// Validates account sender, checks transferInitiator = lockbox's jetton wallet, then finalizes.
fun onDepositAccountForwardNotification(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_ForwardNotification,
) {
    val forwarded = msg.message.load();

    // Parse the forwarded body as TransferNotificationForRecipient.
    val jettonMsg = lazy TransferNotificationForRecipient.fromSlice(forwarded.body.beginParse());

    // Extract context from the jetton notification's forwardPayload.
    val contextCell = loadForwardPayloadAsCell(jettonMsg.forwardPayload);
    assert(contextCell != null, LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountNotification);

    val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();

    // Validate sender: derive expected account address and verify.
    val releaseRecipient = getReleaseRecipientFromContext(contextCell);
    var beneficiaries: map<address, bool> = [];
    beneficiaries.set(releaseRecipient, true);
    val expectedOaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        releaseRecipient,
        contract.getAddress(),
        beneficiaries,
    );
    assert(sender == expectedOaa.calculateAddress(), LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountNotification);

    // Verify transferInitiator is the lockbox's addr (auth the transfer source).
    assert(jettonMsg.transferInitiator != null, LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountNotification);
    assert(jettonMsg.transferInitiator! == st.lockbox, LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountNotification);

    var pool = loadPool(st);
    pool.sendReleaseOrMintFinished(operation);
    st.poolData = pool.data.toCell();
}

/// Extracts the recipient address from a release context cell.
fun getReleaseRecipientFromContext(contextCell: cell): address {
    val context = LockReleaseLockboxTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val requestMsg = lazy operation.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    return details.receiver;
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
            onReleaseOrMint: null,
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
