// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.2

import "../../../lib/utils"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/funding/jetton_withdrawable"

import "../../common/types"
import "../../accounts/deposit/messages"
import "../../rmn_remote/lib"

import "../lib/token_pool/entrypoint"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/errors"
import "../lockbox/messages"

import "messages"
import "types"
import "storage"
import "../../../lib/access/access_control"
import "../../../lib/access/ownable_2step"


contract LockReleaseLockboxTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.pool.LockReleaseLockboxTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | LockReleaseLockboxTokenPool_InMessage

    forceAbiExport: (
        LockReleaseLockboxTokenPool_LockContext,
        LockReleaseLockboxTokenPool_ReleaseContext,
        AccessControl_InMessage
    )
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

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
            // Excess TON from jetton transfer — just keep the coins.
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Handles bounced lock (deposit) messages: returns jettons and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    var st = Storage.load();
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy LockReleaseLockboxTokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        AskToTransfer => {
            // Distinguish a fee-withdrawal `AskToTransfer` (tagged with a `WithdrawContext`) from a
            // lock `AskToTransfer` (tagged with a `LockContext`).
            val data = st.poolData.load();
            val jc = data.jettonClient();
            if (JettonWithdrawable.onWithdrawBounced(jc.walletAddress(), msg)) {
                assert(jc.isWallet(in.senderAddress)) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
                st.store();

                return;
            }

            onLockTransferBounced(mutate st, in.senderAddress, msg);
            st.store();
        }
        // The hooks contract rejected our CCV query. Finalize by notifying the original requester.
        TokenPool_GetCCVs => {
            var pool = loadPool(st);
            pool.onGetCCVsBounced(msg, rich.exitCode);
            st.poolData = pool.data.toCell();
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
            forwardTonAmount: grams("0.01"), // TODO: make dynamic, required for TransferNotificationForRecipient
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
 * 1. Router deploys the receiver's deposit account and sends TokenPool_ReleaseOrMint
 * 2. TokenPool library validates, calls onReleaseOrMintContinue
 * 3. We send JettonLockBox_Withdraw to the lockbox, targeting the receiver's deposit account
 * 4. Lockbox sends AskToTransfer from its jetton wallet to the account's jetton wallet
 * 5. The account forwards the notification to the ReceiveExecutor, which finalizes the transfer
 * 6. On error, the lockbox sends JettonLockBox_WithdrawFailed directly to the pool
 */

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    assert(msg.receiverAccount != null && msg.replyTo != null, TokenPool_Error.UnsupportedOperation);
    val st = ctx!;
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

    // The account forwards the jetton notification to `replyTo` (the ReceiveExecutor). The
    // release context rides along in the envelope only for the lockbox failure path.
    val envelope = DepositAccount_Notify {
        notify: msg.replyTo!,
        payload: context.toCell(),
    };
    val withdrawExtra = JettonLockBox_WithdrawExtra {
        sendExcessesTo: contract.getAddress(),
        failureContext: null,
        forwardTonAmount: grams("0.01"), // required for TransferNotificationForRecipient
        forwardPayload: envelope.toCell(),
    };

    val jc = st.poolData.load().jettonClient();
    val withdraw = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.lockbox,
        body: JettonLockBox_Withdraw {
            queryId: msg.queryId,
            token: jc.masterAddress,
            remoteChainSelector: details.remoteChainSelector,
            amount: prepared.localAmount,
            recipientWallet: msg.receiverAccount!, // account address (owner of the destination wallet)
            extra: withdrawExtra.toCell(),
        },
    });
    withdraw.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    return st;
}

fun onWithdrawFailed(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_WithdrawFailed,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    // JettonLockBox_WithdrawFailed carries the transfer's forward payload (our Notify envelope) as
    // context. If present, use it to send a failure reply to the original requester.
    if (msg.context != null) {
        val envelope = lazy DepositAccount_Notify.fromCell(msg.context!);
        assert(envelope.payload != null) throw 0xFFFF;
        val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(envelope.payload!);
        assert(msg.queryId == context.forwardPayload.load().requestMsg.load().queryId) throw 0xFFFF;
        val operation = context.forwardPayload.load();
        var pool = loadPool(st);
        pool.refundReleaseOrMintRateLimit(operation);
        st.poolData = pool.data.toCell();
        pool.sendReleaseOrMintFailure(operation, LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed as uint16);
    }
}

/* === Pool loader === */

fun loadPool(st: Storage): TokenPool<Storage> {
    return TokenPool<Storage> {
        data: st.poolData.load(),
        context: st,
        hooks: TokenPool_Hooks<Storage> {
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
            onWithdrawFeeTokens: null,
        },
    };
}

/* === Getters === */

get fun typeAndVersion(): (slice, slice) {
    return (LockReleaseLockboxTokenPool_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return LockReleaseLockboxTokenPool_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(LockReleaseLockboxTokenPool_FACILITY_NAME.crc32(), local);
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

get fun verifyNotCursed(subject: uint128): bool {
    return !Storage.load().poolData.load().localPolicy.load().cursePolicy.cursedSubjects.isCursed(subject);
}

get fun owner(): address {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().owner;
}

/// Curse administrator for the pool-local policy, distinct from `owner()`.
get fun rmn_owner(): address {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.admin.get_owner();
}

get fun rmn_pendingOwner(): address? {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.admin.get_pendingOwner();
}

get fun rmn_hasRole(role: uint256, account: address): bool {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.hookTrait__AccessControl().hasRole(role, account);
}

get fun rmn_getRoleAdmin(role: uint256): uint256 {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.hookTrait__AccessControl().getRoleAdmin(role);
}

/// Effective curse authority. `rmn_hasRole` under-reports: the policy admin is
/// an implicit role bearer.
get fun rmn_canCurse(account: address): bool {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.canCurse(account);
}

get fun rmn_canUncurse(account: address): bool {
    return Storage.load().poolData.load().localPolicy.load().cursePolicy.canUncurse(account);
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

/// Returns the amount that would be passed to the CCV hooks for a `getCCVs` query,
/// given a transfer direction. Mirrors EVM's `getRequiredCCVs` amount logic: outbound is the
/// post-fee source-denominated amount; inbound is the source amount converted to local decimals
/// (via `sourcePoolData` in `extraData`).
/// @param remoteChainSelector The remote lane.
/// @param sourceDenominatedAmount The source-denominated amount.
/// @param requestedFinalityConfig Requested finality encoding.
/// @param direction `TokenPool_MessageDirection` (0 outbound, 1 inbound).
/// @param extraData Direction-specific payload (tokenArgs outbound, sourcePoolData inbound).
get fun getCCVAmount(
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: TokenPool_MessageDirection,
    extraData: cell?,
): coins {
    val pool = loadPool(Storage.load());
    return pool.getCCVAmount(remoteChainSelector, sourceDenominatedAmount, requestedFinalityConfig, direction, extraData);
}
