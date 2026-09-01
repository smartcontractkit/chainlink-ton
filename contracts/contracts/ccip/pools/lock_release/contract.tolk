// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton-utils"
import "../../../lib/jetton/jetton_client"

import "../../common/types"
import "../../accounts/deposit/messages"
import "../../accounts/deposit/types"
import "../../rmn_remote/lib"

import "../lib/token_pool/entrypoint"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/errors"
import "../lib/token_pool/events"

import "messages"
import "types"
import "storage"

contract LockReleaseTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.pool.LockReleaseTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | LockReleaseTokenPool_InMessage
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

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

/// @notice Deploys a DepositAccount (off-ramp role) for release operations.
/// owner = pool (deploys and inits the account), proxy = pool, beneficiary = recipient
/// (can withdraw released jettons).
fun deployOffRampAccountWithRelease(
    st: Storage,
    recipient: address,
    queryId: uint64,
    context: LockReleaseTokenPool_ReleaseContext,
) {
    var beneficiaries: map<address, ()> = [];
    beneficiaries.set(recipient, ());
    val oaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        contract.getAddress(), // owner = pool (inits the account)
        contract.getAddress(), // proxy = pool
        beneficiaries,
    );

    val deploy = createMessage({
        bounce: BounceMode.RichBounce,
        value: LockReleaseTokenPool_OFF_RAMP_ACCOUNT_DEPLOY_VALUE,
        dest: oaa,
        body: DepositAccount_Init {
            queryId,
            forwardPayload: context.toCell(),
        },
    });
    deploy.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// @notice Handles DepositAccount_Reply after account deployment for release.
/// Extracts context from Reply forwardPayload, then sends AskToTransfer to the pool's jetton wallet.
/// Context is embedded in forwardPayload so it flows through: wallet → account → pool.
fun onDepositAccountReply(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_Reply,
) {
    // Extract release context from Reply forwardPayload.
    assert(msg.forwardPayload != null, LockRelease_Error.InvalidOffRampAccountReply);
    val contextCell = msg.forwardPayload!;
    val context = LockReleaseTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();
    val requestIn = lazy operation.requestMsg.load().request.load();
    val details = lazy requestIn.transfer.details.load();

    // Validate sender: derive expected account address and verify. Owner = proxy = pool,
    // beneficiary = the final recipient.
    val jettonClient = st.poolData.load().jettonClient();
    var beneficiaries: map<address, ()> = [];
    beneficiaries.set(details.receiver, ());
    val expectedOaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        contract.getAddress(), // owner = pool
        contract.getAddress(), // proxy = pool
        beneficiaries,
    );
    assert(sender == expectedOaa.calculateAddress(), LockRelease_Error.InvalidOffRampAccountReply);

    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: st.poolData.load().jettonClient().walletAddress(),
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: prepared.localAmount,
            transferRecipient: sender,
            sendExcessesTo: contract.getAddress(), // pool keeps any excesses
            customPayload: null,
            forwardTonAmount: ton("0.01"), // TODO: make dynamic, required for TransferNotificationForRecipient
            forwardPayload: beginCell()
                .storeMaybeRef(contextCell)
                .endCell()
                .beginParse(),
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
        // The account rejected init (e.g. could not fund its rent reserve). Refund the rate limit and
        // reply with a failure so the sender can retry instead of the release silently stalling.
        DepositAccount_Init => {
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
    assert(msg.forwardPayload != null, LockRelease_Error.UnexpectedReleaseBounce);
    val context = LockReleaseTokenPool_ReleaseContext.fromCell(msg.forwardPayload!);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.refundReleaseOrMintRateLimit(operation);
    st.poolData = pool.data.toCell();
    pool.sendReleaseOrMintFailure(operation, LockRelease_Error.OffRampAccountDeployFailed as uint16);
}

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx!;

    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();
    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val context = LockReleaseTokenPool_ReleaseContext {
        forwardPayload: forwardPayload.toCell(),
    };

    // Deploy DepositAccount (off-ramp role) with context embedded.
    // owner = recipient (can withdraw released jettons).
    // proxy = this pool (receives completion notification).
    deployOffRampAccountWithRelease(
        st,
        details.receiver,
        msg.queryId,
        context,
    );

    return st;
}

fun onReleaseTransferBounced(
    mutate st: Storage,
    sender: address,
    msg: AskToTransfer,
) {
    assert(st.poolData.load().jettonClient().isWallet(sender)) throw LockRelease_Error.UnexpectedReleaseBounce;
    val contextCell = loadForwardPayloadAsCell(msg.forwardPayload);
    assert(contextCell != null) throw LockRelease_Error.UnexpectedReleaseBounce;

    val context = lazy LockReleaseTokenPool_ReleaseContext.fromCell(contextCell!);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.refundReleaseOrMintRateLimit(operation);
    st.poolData = pool.data.toCell();
    pool.sendReleaseOrMintFailure(operation, LockRelease_Error.UnexpectedReleaseBounce as uint16);
}

/// @notice Handles ForwardNotification from DepositAccount after release completion.
/// The forwarded message body contains TransferNotificationForRecipient with the release context
/// embedded in its forwardPayload. Validates account sender, extracts context, finalizes.
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
    assert(contextCell != null, LockRelease_Error.InvalidOffRampAccountNotification);

    val context = lazy LockReleaseTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();

    // Validate sender: the forwarded notification must come from the account and its original
    // jetton wallet (the account's own derived wallet for this pool's token).
    val mintRecipient = getReleaseRecipientFromContext(contextCell);
    val jettonClient = st.poolData.load().jettonClient();
    var beneficiaries: map<address, ()> = [];
    beneficiaries.set(mintRecipient, ());
    val expectedOaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        contract.getAddress(), // owner = pool
        contract.getAddress(), // proxy = pool
        beneficiaries,
    );
    assert(sender == expectedOaa.calculateAddress(), LockRelease_Error.InvalidOffRampAccountNotification);

    // The original message's sender must be the account's own jetton wallet for this token, proving
    // a real transfer of the pool's token reached the account (not a spoofed arbitrary sender).
    val expectedWallet = calcAddressOfJettonWallet(
        expectedOaa.calculateAddress(),
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );
    assert(forwarded.senderAddress == expectedWallet, LockRelease_Error.InvalidOffRampAccountNotification);

    // Verify transferInitiator is the pool (auth the transfer source).
    assert(jettonMsg.transferInitiator != null, LockRelease_Error.InvalidOffRampAccountNotification);
    assert(jettonMsg.transferInitiator! == contract.getAddress(), LockRelease_Error.InvalidOffRampAccountNotification);

    var pool = loadPool(st);
    pool.sendReleaseOrMintFinished(operation);
    st.poolData = pool.data.toCell();
}

/// @notice Extracts the recipient address from a release context cell.
fun getReleaseRecipientFromContext(contextCell: cell): address {
    val context = LockReleaseTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val requestMsg = lazy operation.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    return details.receiver;
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
            onReleaseOrMint: null,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
        },
    };
}

get fun typeAndVersion(): (slice, slice) {
    return (LockReleaseTokenPool_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return LockReleaseTokenPool_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(LockReleaseTokenPool_FACILITY_NAME.crc32(), local);
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
