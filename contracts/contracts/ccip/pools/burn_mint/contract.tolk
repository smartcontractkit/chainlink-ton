// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.2

import "@stdlib/lisp-lists"
import "@stdlib/gas-payments"

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/access/access_control"
import "../../../lib/deployable/types"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/jetton-utils"
import "../../../lib/jetton/forward_payload_wrap"
import "../../../lib/funding/jetton_withdrawable"

import "../../common/types"
import "../../cct/messages"
import "../../rmn_remote/lib"

import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/errors"
import "../lib/token_pool/entrypoint"
import "../lib/token_pool/budget"
import "../lib/token_pool/events"
import "../lib/token_pool/jetton_fees"

import "types"
import "messages"
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
    outgoingMessages:
        | TokenPool_OutMessage
        | BurnMintTokenPool_OutMessage

    emittedEvents: TokenPool_Events

    forceAbiExport: (
        BurnMintTokenPool_BurnContext,
        BurnMintTokenPool_MintContext,
        AccessControl_InMessage
    )
}

const CONTRACT_VERSION = "0.1.0".literalSlice();

fun onInternalMessage(in: InMessage) {
    var st = Storage.load();
    var pool = st.TokenPool();
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
            onClaimMinterAdmin(mutate st, in.senderAddress, in.valueCoins, msg.queryId);
            st.store();
        }
        CCT_ReturnExcessesBack => {
            onCCTReturnExcessesBack(mutate st, in.senderAddress, in.valueCoins, msg);
            st.store();
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// @notice Handles bounced burn/mint messages: refunds rate limit and sends failure reply.
fun onBouncedMessage(in: InMessageBounced) {
    var st = Storage.load();

    // Base library first recovers the messages it emits (GetCCVs query, LockOrBurnWithdraw).
    var basePool = st.TokenPool();
    if (basePool.onBouncedMessage(in.senderAddress, in.valueCoins, in.bouncedBody)) {
        st.poolData = basePool.data.toCell();
        st.store();

        return;
    }

    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy BurnMintTokenPool_BouncedMessage.fromCell(rich.originalBody);
    match (msg) {
        // Recovery returns are best-effort; their bounced value stays with the pool.
        AskToTransfer => {
            val data = st.poolData.load();
            val wallet  = data.jettonClient().walletAddress();
            assert(in.senderAddress == wallet) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;
            JettonWithdrawable.onWithdrawBounced(wallet, msg);
            st.store();
        }
        CCT_AskToBurn => {
            assert(msg.forwardPayload != null) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;
            val context = lazy BurnMintTokenPool_BurnContext.fromCell(msg.forwardPayload);
            assert(in.senderAddress == context.wallet) throw BurnMintTokenPool_Error.UnexpectedBurnBounce;

            val operation = lazy context.forwardPayload.load();
            var pool = st.TokenPool();
            val exitCode = BurnMintTokenPool_Error.UnexpectedBurnBounce as int32;
            val custodyReturn = TokenPool<void>.createCustodyReturn(operation, context.transferInitiator);
            pool.recoverLockOrBurnFailure(operation, exitCode, in.valueCoins, custodyReturn);

            st.poolData = pool.data.toCell();
            st.store();
        }
        MintNewJettons => {
            assert(in.senderAddress == st.poolData.load().jettonClient().masterAddress) throw BurnMintTokenPool_Error.UnexpectedMintBounce;
            val internalTransfer = lazy msg.internalTransferMsg.load();
            val wrap = Jetton_ForwardPayloadWrap.from(internalTransfer.forwardPayload);
            assert(wrap != null && wrap.context != null) throw BurnMintTokenPool_Error.UnexpectedMintBounce;
            val context = lazy BurnMintTokenPool_MintContext.fromCell(wrap.context);

            val operation = lazy context.forwardPayload.load();
            var pool = st.TokenPool();
            val exitCode = BurnMintTokenPool_Error.UnexpectedMintBounce as int32;
            // No custody to return on release/mint failure
            pool.recoverReleaseOrMintFailure(operation, exitCode, in.valueCoins);

            st.poolData = pool.data.toCell();
            st.store();
        }
        ClaimMinterAdmin => {
            // accept bounced TON on failed claim of minter admin
        }
    }
}

/// @notice Handles TransferNotificationForRecipient on the burn path.
/// The pool's own jetton wallet has already credited custody; burn directly via CCT
/// `AskToBurn` carrying the continuation context as `forwardPayload`, then finalize
/// on `CCT_ReturnExcessesBack` back to sender (pool).
fun onLockOrBurnTransferContinue(
    st: Storage,
    sender: address,
    _msgValue: coins, // the custody forward: two custody phases' safety
    msg: TransferNotificationForRecipient,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): Storage {
    val requestMsg = lazy fwdPayload.requestMsg.load();

    val context = BurnMintTokenPool_BurnContext {
        wallet: sender, // own wallet
        forwardPayload: fwdPayload.toCell(),
        transferInitiator: msg.transferInitiator!, // already checked non-null
    };

    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();

    // Continuation target for the burn operation.
    val sendExcessesTo = contract.getAddress();

    // Custody has moved: forward everything. The CCT wallet's burn check rejects an underfunded
    // burn before it commits (the bounce returns custody), and the excess carries the finalize.
    val burnOpts = CreateMessageOptions<CCT_AskToBurn> {
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: context.wallet,
        body: CCT_AskToBurn {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount,
            sendExcessesTo,
            customPayload: null, // not supported atm
            forwardPayload: context.toCell(),
        },
    };

    val sendMode = SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL;
    val fwdFee = createMessage(burnOpts).estimateFeeWithoutSending(sendMode);

    // Check safety budget min size as reference burn/transfer plus LVL3_HIGH finalization costs.
    val safety = st.TokenPool().budget().lockOrBurn.safety;
    val minValue = max(
        JettonFees.Reference.transferValue(0, fwdFee),
        JettonFees.Reference.burnValue(fwdFee, true)
    ) + TokenPool_Costs.finalization();
    assert(safety >= minValue, TokenPool_Error.InsufficientMessageValue);

    val burn = createMessage(burnOpts);
    burn.send(sendMode);

    return st;
}

fun onReleaseOrMintContinue(
    ctx: Storage?,
    sender: address,
    msgValue: coins,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx;
    val delivery = msg.delivery.load();
    val forwardPayload = TokenPool_ReleaseOrMintForwardPayload {
        originalSender: sender,
        requestMsg: msg.toCell(),
        prepared: prepared.toCell(),
    };

    val context = BurnMintTokenPool_MintContext {
        forwardPayload: forwardPayload.toCell(),
    };

    // The mint context rides along in the wrap only for the bounce path.
    val wrap = Jetton_ForwardPayloadWrap {
        initiator: sender,
        context: context.toCell(),
        forwardPayload: delivery.forwardPayload,
    };
    val jettonClient = st.poolData.load().jettonClient();
    val forwardTonAmount = st.TokenPool().releaseOrMintForward(msg.finalizationValue());

    // Caller-selected excess recipient; default to the request sender.
    val sendExcessesTo = msg.sendExcessesTo != null ? msg.sendExcessesTo! : sender;

    // The recipient's notification carries the pool's finalization safety plus the caller's
    // continuation. The minter gets the exact cost of the mint, so it keeps nothing; the wallet
    // returns its unused fee to the pool.
    val transfer = InternalTransferStep {
        queryId: msg.queryId,
        jettonAmount: prepared.localAmount,
        transferInitiator: null,
        sendExcessesTo,
        forwardTonAmount,
        forwardPayload: wrap.asForwardPayload(),
    };
    var mintOpts = CreateMessageOptions<MintNewJettons> {
        bounce: BounceMode.RichBounce,
        value: msgValue, // Upper bound for the fee quote; reduced below.
        dest: jettonClient.masterAddress,
        body: MintNewJettons {
            queryId: msg.queryId,
            mintRecipient: delivery.recipient,
            tonAmount: msgValue, // Upper bound for the fee quote; reduced below.
            internalTransferMsg: transfer.toCell(),
        },
    };

    // The minter checks the wallet transfer against this message's forward fee, so the reference
    // model is exact. It forwards the transfer in a wallet-deploy message, quoted as sent.
    val fwdFee = createMessage(mintOpts).estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY);
    val walletDeployFee = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        value: msgValue,
        dest: calcDeployedJettonWallet(delivery.recipient, jettonClient.masterAddress, jettonClient.jettonWalletCode),
        body: transfer.toCell(),
    }).estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY);

    val tonAmount = JettonFees.Reference.transferValue(forwardTonAmount, fwdFee);
    mintOpts.body.tonAmount = tonAmount;
    mintOpts.value = cctMintOpBudget(walletDeployFee) + tonAmount;

    // Last check before custody moves. The mint carries an explicit value, so this transaction
    // must afford it; otherwise unwind locally rather than fail the send.
    val w = contract.getAddress().getWorkchain();
    val gasFee = calculateGasFee(w, getGasConsumedAtTheMoment() + BurnMintTokenPool_MINT_SEND_GAS_UNITS);
    val minValue = mintOpts.value + fwdFee + gasFee;
    assert(msgValue >= minValue, TokenPool_Error.InsufficientMessageValue);

    val mint = createMessage(mintOpts);
    mint.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    // TODO[DESIGN]: exceses handling for any leftover funds after the mint and wallet deployment fees are covered.

    return st;
}

fun onClaimMinterAdmin(
    mutate st: Storage,
    sender: address,
    msgValue: coins,
    queryId: uint64,
) {
    assert(msgValue >= TokenPool_Costs.admin(), TokenPool_Error.InsufficientMessageValue);

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
/// are ignored.
fun onCCTReturnExcessesBack(
    mutate st: Storage,
    sender: address,
    msgValue: coins,
    msg: CCT_ReturnExcessesBack,
) {
    // burn committed; authenticate and complete, no reversal exists;

    // Context-less signals are pure excess returns (mint/transfer paths) — nothing to finalize.
    if (msg.forwardPayload == null) {
        return;
    }

    var pool: TokenPool<Storage> = st.TokenPool();
    // The only source that carries a burn continuation is the CCT JettonMinter for this token.
    assert(sender == pool.data.jettonClient().masterAddress, TokenPool_Error.Unauthorized);
    // The minter sets `initiator` to the burnInitiator, which is the pool's own wallet owner (pool).
    assert(msg.initiator == contract.getAddress(), TokenPool_Error.Unauthorized);

    val context = lazy BurnMintTokenPool_BurnContext.fromCell(msg.forwardPayload);
    val operation = lazy context.forwardPayload.load();

    pool.onLockOrBurnTransferFinalize(msgValue, operation);
    st.poolData = pool.data.toCell();
}

fun defaultBudget(_ctx: Storage?): TokenPool_Budget {
    return BurnMintTokenPool_defaultBudget();
}

fun Storage.TokenPool(self): TokenPool<Storage> {
    return TokenPool<Storage> {
        data: self.poolData.load(),
        context: self,
        hooks: TokenPool_Hooks<Storage> {
            onLockOrBurnTransferContinue,
            onReleaseOrMintContinue,
            defaultBudget,
            // Mints carry no transfer initiator; the CCT wallet only accepts that from the minter.
            transferInitiator: null,
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

get fun verifyNotCursed(subject: uint128): bool {
    return !Storage.load().poolData.load().localPolicy.load().cursePolicy.cursedSubjects.isCursed(subject);
}

get fun owner(): address {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().owner;
}

/// Gets the pending owner of the pool, if any (Ownable2Step).
get fun pendingOwner(): address? {
    return Storage.load().poolData.load().adminConfig.load().ownable.load().get_pendingOwner();
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
    return Storage.load().TokenPool().getCurrentRateLimiterState(remoteChainSelector, fastFinality);
}

/// Returns whether the given token address is supported by this pool.
get fun isSupportedToken(token: address): bool {
    return Storage.load().TokenPool().isSupportedToken(token);
}

/// Effective per-flow budget (instance config raised to the pool-type default).
get fun getBudget(): TokenPool_Budget {
    return Storage.load().TokenPool().budget();
}

/// Returns the pool's dynamic configuration (router, rateLimitAdmin, feeAdmin).
get fun getDynamicConfig(): TokenPool_DynamicConfig {
    return Storage.load().TokenPool().getDynamicConfig();
}

/// Returns the finality config as defined in the FinalityCodec library.
get fun getAllowedFinalityConfig(): uint32 {
    return Storage.load().TokenPool().getAllowedFinalityConfig();
}

/// Returns the advanced pool hooks contract address, or null if not set.
get fun getAdvancedPoolHooks(): address? {
    return Storage.load().TokenPool().getAdvancedPoolHooks();
}

/// Returns the list of supported remote chain selectors.
get fun getSupportedChains(): lisp_list<uint64> {
    return Storage.load().TokenPool().getSupportedChains();
}

/// Checks if the given remote pool address is configured for the given remote chain.
get fun isRemotePool(remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool {
    return Storage.load().TokenPool().isRemotePool(remoteChainSelector, remotePoolAddress);
}

/// Returns the remote token address for the given remote chain.
get fun getRemoteToken(remoteChainSelector: uint64): Cell<CrossChainAddress> {
    return Storage.load().TokenPool().getRemoteToken(remoteChainSelector);
}

/// Returns the list of remote pool addresses for the given remote chain.
get fun getRemotePools(remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>> {
    return Storage.load().TokenPool().getRemotePools(remoteChainSelector);
}

/// Returns the token transfer fee configuration for the given destination chain selector.
get fun getTokenTransferFeeConfig(destChainSelector: uint64): TokenPool_TokenTransferFeeConfig? {
    return Storage.load().TokenPool().getTokenTransferFeeConfig(destChainSelector);
}

/// Returns the pool-local cursed subjects.
get fun cursedSubjects(): lisp_list<uint128> {
    return keysLispList(Storage.load().poolData.load().localPolicy.load().cursePolicy.cursedSubjects.data)!;
}

/// Returns the pool's admin configuration.
get fun getAdminConfig(): TokenPool_AdminConfig {
    return Storage.load().poolData.load().adminConfig.load();
}

/// Returns the remote chain configuration for the given selector, or null if unknown.
get fun getRemoteChainConfig(remoteChainSelector: uint64): TokenPool_RemoteChainConfig? {
    val entry = Storage.load().poolData.load().remoteChainConfigs.get(remoteChainSelector);
    return entry.isFound ? entry.loadValue() : null;
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
    return Storage.load().TokenPool().getFee(
        localToken,
        destChainSelector,
        amount,
        feeToken,
        requestedFinalityConfig,
        tokenArgs
    );
}

/// Calculates the fee amount based on the transfer details and finality config.
get fun getFeeAmount(
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): coins {
    return Storage.load().TokenPool().getFeeAmount(transfer, requestedFinalityConfig);
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
    return Storage.load().TokenPool().getCCVAmount(
        remoteChainSelector,
        sourceDenominatedAmount,
        requestedFinalityConfig,
        direction,
        extraData
    );
}
