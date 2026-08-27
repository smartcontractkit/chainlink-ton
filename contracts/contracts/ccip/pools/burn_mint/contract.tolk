// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/jetton-utils"

import "../../cct/messages"
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
import "storage"

/// @notice Burn-Mint Token Pool implementation for CCIP.
/// Burns jettons on the source chain and mints them on the destination chain.
contract BurnMintTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.pool.BurnMintTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | BurnMintTokenPool_InMessage
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

    val msg = lazy BurnMintTokenPool_InMessage.fromSlice(in.body);
    match (msg) {
        BurnMintTokenPool_ClaimMinterAdmin => {
            onClaimMinterAdmin(mutate st, in.senderAddress, msg.queryId);
            st.store();
        }
        CCT_ReturnExcessesBack => {
            onCCTReturnExcessesBack(mutate st, in.senderAddress, msg);
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
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// @notice Sends the CCT `AskToBurn` operational message to the pool's own jetton wallet
/// to burn the locked tokens. The burn continuation context is attached as `forwardPayload`,
/// which the CCT wallet relays via the minter back to the pool on `CCT_ReturnExcessesBack`.
fun sendBurnMessage(
    st: Storage,
    queryId: uint64,
    context: BurnMintTokenPool_BurnContext,
) {
    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();
    val burnMsg = createMessage({
        bounce: BounceMode.RichBounce,
        value: BurnMintTokenPool_BURN_VALUE,
        dest: context.wallet,
        body: CCT_AskToBurn {
            queryId: queryId,
            jettonAmount: prepared.destTokenAmount,
            sendExcessesTo: contract.getAddress(),
            customPayload: context.toCell(),
            forwardPayload: context.toCell(),
        },
    });
    burnMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// @notice Handles bounced burn/mint messages: refunds rate limit and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    var st = Storage.load();
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy BurnMintTokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        CCT_AskToBurn => {
            assert(msg.customPayload != null) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;
            val context = lazy BurnMintTokenPool_BurnContext.fromCell(msg.customPayload!);
            assert(in.senderAddress == context.wallet) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;

            val operation = lazy context.forwardPayload.load();
            // The burn never happened, so custody is still in the pool's own wallet. Return the
            // jettons to the original sender (best-effort) so they aren't permanently locked here,
            // then refund the rate limit and notify the requester of the failure.
            var pool = loadPool(st);
            pool.returnTransferLocked(operation);
            pool.refundLockOrBurnRateLimit(operation);
            st.poolData = pool.data.toCell();
            pool.sendLockOrBurnFailure(operation, BurnMintTokenPool_Error.UnexpectedBurnBounce as uint16);
            st.store();
        }
        MintNewJettons => {
            assert(in.senderAddress == st.poolData.load().jettonClient().masterAddress) throw BurnMintTokenPool_Error.UnexpectedMintBounce;
            val internalTransfer = lazy msg.internalTransferMsg.load();
            val contextCell = loadForwardPayloadAsCell(internalTransfer.forwardPayload);
            assert(contextCell != null) throw BurnMintTokenPool_Error.UnexpectedMintBounce;
            val context = lazy BurnMintTokenPool_MintContext.fromCell(contextCell!);

            val operation = lazy context.forwardPayload.load();
            var pool = loadPool(st);
            pool.refundReleaseOrMintRateLimit(operation);
            st.poolData = pool.data.toCell();
            pool.sendReleaseOrMintFailure(operation, BurnMintTokenPool_Error.UnexpectedMintBounce as uint16);
            st.store();
        }
        // The OAA rejected init (e.g. could not fund its rent reserve). Refund the rate limit and
        // reply with a failure so the sender can retry instead of the mint silently stalling.
        DepositAccount_Init => {
            onDepositAccountInitBounced(mutate st, in.senderAddress, msg);
            st.store();
        }
    }
}

/// @notice Handles a bounced `DepositAccount_Init`: refunds the inbound rate limit and sends a
/// mint failure reply. The init carries the mint context in `forwardPayload`.
fun onDepositAccountInitBounced(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_Init,
) {
    assert(msg.forwardPayload != null, BurnMintTokenPool_Error.OffRampAccountDeployFailed);
    val context = BurnMintTokenPool_MintContext.fromCell(msg.forwardPayload!);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.refundReleaseOrMintRateLimit(operation);
    st.poolData = pool.data.toCell();
    pool.sendReleaseOrMintFailure(operation, BurnMintTokenPool_Error.OffRampAccountDeployFailed as uint16);
}

/// @notice Handles TransferNotificationForRecipient on the burn path.
/// The pool's own jetton wallet has already credited custody; burn directly via CCT
/// `AskToBurn` carrying the continuation context, then finalize on `CCT_ReturnExcessesBack`.
fun onLockOrBurnTransferContinue(
    st: Storage,
    sender: address,
    _msg: TransferNotificationForRecipient,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): Storage {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val context = BurnMintTokenPool_BurnContext {
        wallet: sender,
        forwardPayload: fwdPayload.toCell(),
    };

    sendBurnMessage(st, requestMsg.queryId, context);

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
    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();
    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val context = BurnMintTokenPool_MintContext {
        forwardPayload: forwardPayload.toCell(),
    };
 
    // Deploy OffRampAccount with context embedded.
    // OAA owner = recipient (can withdraw minted jettons).
    // OAA notificationTarget = this pool (receives completion notification).
    deployOffRampAccountWithMint(
        st,
        details.receiver,
        msg.queryId,
        context,
    );

    return st;
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

/// @notice Handles `CCT_ReturnExcessesBack` sent by the CCT JettonMinter on the burn path.
/// The minter relays the burn continuation context (the `BurnMintTokenPool_BurnContext`
/// embedded by this pool in `CCT_AskToBurn.forwardPayload`) back to this pool, which then
/// finalizes the lock/burn. Context-less excess signals (e.g. from the mint/transfer paths)
/// are ignored. Mint still finalizes via OffRampAccount.
fun onCCTReturnExcessesBack(
    mutate st: Storage,
    sender: address,
    msg: CCT_ReturnExcessesBack,
) {
    // Context-less signals are pure excess returns (mint/transfer paths) — nothing to finalize.
    if (msg.forwardPayload == null) {
        return;
    }

    var pool: TokenPool<Storage> = loadPool(st);
    // The only source that carries a burn continuation is the CCT JettonMinter for this token.
    assert(sender == pool.data.jettonClient().masterAddress, TokenPool_Error.Unauthorized);
    // The minter sets `initiator` to the burnInitiator, which is the pool's own wallet owner (pool).
    assert(msg.initiator == contract.getAddress(), TokenPool_Error.Unauthorized);

    val context = lazy BurnMintTokenPool_BurnContext.fromCell(msg.forwardPayload!);
    val operation = lazy context.forwardPayload.load();
    // TODO: is this check necessary?
    assert(context.wallet == pool.data.jettonClient().walletAddress(), BurnMintTokenPool_Error.UnexpectedBurnBounce);

    pool.onLockOrBurnTransferFinalize(operation);
    st.poolData = pool.data.toCell();
}

/// @notice Deploys a DepositAccount (off-ramp role) for mint operations.
/// owner = pool (deploys and inits the account), proxy = pool, beneficiary = recipient
/// (withdraws minted jettons).
fun deployOffRampAccountWithMint(
    st: Storage,
    recipient: address,
    queryId: uint64,
    context: BurnMintTokenPool_MintContext,
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
        value: 0,
        dest: oaa,
        body: DepositAccount_Init {
            queryId,
            forwardPayload: context.toCell(),
        },
    });
    deploy.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// @notice Handles DepositAccount_Reply after account deployment for mint.
/// Extracts context from Reply forwardPayload, then sends MintNewJettons to the account's jetton wallet.
fun onDepositAccountReply(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_Reply,
) {
    // Extract mint context from Reply forwardPayload.
    assert(msg.forwardPayload != null, BurnMintTokenPool_Error.InvalidOffRampAccountReply);
    val contextCell = msg.forwardPayload!;
    val context = BurnMintTokenPool_MintContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();

    // Validate sender: derive expected account address from the mint recipient and verify.
    val mintRecipient = getMintRecipientFromContext(contextCell);
    val jettonClient = st.poolData.load().jettonClient();
    var beneficiaries: map<address, ()> = [];
    beneficiaries.set(mintRecipient, ());
    val expectedOaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        contract.getAddress(), // owner = pool
        contract.getAddress(), // proxy = pool
        beneficiaries,
    );
    assert(sender == expectedOaa.calculateAddress(), BurnMintTokenPool_Error.InvalidOffRampAccountReply);

    // OAA is confirmed deployed. Send MintNewJettons to the jetton minter.
    // The minter calculates the wallet address from the recipient internally.
    // mintRecipient = OAA address (owner), not the OAA's jetton wallet.
    val mint = createMessage({
        bounce: BounceMode.RichBounce,
        value: BurnMintTokenPool_MINT_VALUE,
        dest: jettonClient.masterAddress,
        body: MintNewJettons {
            queryId: msg.queryId,
            mintRecipient: sender, // OAA address — minter derives wallet from this
            tonAmount: BurnMintTokenPool_MINT_VALUE,
            internalTransferMsg: InternalTransferStep {
                queryId: msg.queryId,
                jettonAmount: prepared.localAmount,
                transferInitiator: null,
                sendExcessesTo: contract.getAddress(), // pool keeps any excesses
                forwardTonAmount: ton("0.01"), // required for TransferNotificationForRecipient
                forwardPayload: beginCell()
                    .storeMaybeRef(contextCell)
                    .endCell()
                    .beginParse(),
            }.toCell(),
        },
    });
    mint.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// @notice Extracts the recipient address from a mint context cell.
fun getMintRecipientFromContext(contextCell: cell): address {
    val context = BurnMintTokenPool_MintContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val requestMsg = lazy operation.requestMsg.load();
    val request = lazy requestMsg.request.load();
    val details = lazy request.transfer.details.load();
    return details.receiver;
}

/// @notice Handles DepositAccount_ForwardNotification after mint completion.
/// The forwarded message body contains the original jetton TransferNotificationForRecipient
/// with the mint context embedded in its forwardPayload.
fun onDepositAccountForwardNotification(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_ForwardNotification,
) {
    val forwarded = msg.message.load();

    // Parse the forwarded body as TransferNotificationForRecipient.
    val jettonMsg = lazy TransferNotificationForRecipient.fromSlice(forwarded.body.beginParse());
    assert(jettonMsg.transferInitiator == null, BurnMintTokenPool_Error.InvalidOffRampAccountNotification);

    // Extract context from the jetton notification's forwardPayload.
    val contextCell = loadForwardPayloadAsCell(jettonMsg.forwardPayload);
    assert(contextCell != null, BurnMintTokenPool_Error.InvalidOffRampAccountNotification);

    val context = lazy BurnMintTokenPool_MintContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();

    // Validate sender: the forwarded notification must come from the account and its original
    // jetton wallet (the account's own derived wallet for this pool's token).
    val mintRecipient = getMintRecipientFromContext(contextCell);
    val jettonClient = st.poolData.load().jettonClient();
    var beneficiaries: map<address, ()> = [];
    beneficiaries.set(mintRecipient, ());
    val expectedOaa = calcAddressOfDepositAccount(
        st.offRampAccountCode,
        contract.getAddress(), // owner = pool
        contract.getAddress(), // proxy = pool
        beneficiaries,
    );
    assert(sender == expectedOaa.calculateAddress(), BurnMintTokenPool_Error.InvalidOffRampAccountNotification);

    // The original message's sender must be the account's own jetton wallet for this token, proving
    // a genuine mint deposited into the account (not a spoofed arbitrary sender).
    val expectedWallet = calcAddressOfJettonWallet(
        expectedOaa.calculateAddress(),
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );
    assert(forwarded.senderAddress == expectedWallet, BurnMintTokenPool_Error.InvalidOffRampAccountNotification);

    // For mint path, transferInitiator is null (minter is the authority — no source wallet auth needed).

    var pool = loadPool(st);
    pool.sendReleaseOrMintFinished(operation);
    st.poolData = pool.data.toCell();
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
            onLockOrBurnTransferContinue,
            onReleaseOrMint: null,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
        },
    };
}

get fun typeAndVersion(): (slice, slice) {
    return (BurnMintTokenPool_FACILITY_NAME.literalSlice(), CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return BurnMintTokenPool_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(BurnMintTokenPool_FACILITY_NAME.crc32(), local);
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
