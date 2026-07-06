// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/lisp-lists"

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton-utils"
import "../../../lib/jetton/jetton_client"
import "../../common/types"
import "../../rmn_remote/lib"
import "../lib/token_pool/entrypoint"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/events"
import "../lib/token_pool/errors"
import "../lib/rate_limiter"

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
        ReturnExcessesBack => {
            onReturnExcessesBack(mutate st, in.senderAddress, msg);
            st.store();
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

// TODO: implement me
fun onBouncedMessage(in: InMessageBounced) {
    // TODO: use TokenPool.onBouncedMessage (lib) handler
    val msg = lazy LockReleaseTokenPool_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
        AskToTransfer => {
            var st = Storage.load();
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
    assert(!st.pendingReleases.get(msg.queryId).isFound, Error.PendingReleaseAlreadyExists);
    val jettonClient = st.poolData.load().jettonClient();

    val request = lazy msg.request.load();
    val details = lazy request.transfer.details.load();

    val recipientWallet = calcAddressOfJettonWallet(
        details.receiver,
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    st.pendingReleases.set(msg.queryId, LockReleaseTokenPool_PendingRelease {
        replyTo: msg.replyTo,
        request: request.toCell(),
        out: prepared.out.toCell(),
        expectedSender: recipientWallet,
    }.toCell());

    val ownWallet = calcAddressOfJettonWallet(
        contract.getAddress(),
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    val transfer = createMessage({
        // TODO: use RichBounce to recover context, currently breaks with exitCode: 63 b/x
        // `skipBouncedPrefix` in the handler.
        bounce: true,
        value: LockReleaseTokenPool_RELEASE_TRANSFER_VALUE,
        dest: ownWallet,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: prepared.localAmount as coins,
            transferRecipient: details.receiver,
            sendExcessesTo: contract.getAddress(), // TODO: ContextExecutor
            customPayload: null,
            forwardTonAmount: 0, // TODO: add fwdp amount
            // TODO: add fwdp
            forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
        },
    });
    transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);

    return st;
}

fun onReturnExcessesBack(
    mutate st: Storage,
    sender: address,
    msg: ReturnExcessesBack,
) {
    val pendingEntry = st.pendingReleases.get(msg.queryId);
    assert(pendingEntry.isFound, Error.PendingReleaseNotFound);

    val pending = pendingEntry.loadValue().load();
    assert(sender == pending.expectedSender, Error.UnexpectedReleaseConfirmationSender);

    st.pendingReleases.delete(msg.queryId);
    val request = lazy pending.request.load();
    val details = lazy request.transfer.details.load();
    val out = lazy pending.out.load();

    emit(TOPIC_TOKEN_POOL_RELEASED_OR_MINTED, TokenPool_ReleasedOrMinted {
        remoteChainSelector: details.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: details.localToken,
            sender: contract.getAddress(), // TODO: who should we put as sender? (msg.sender on EVM)
            amount: out.destinationAmount,
            recipient: details.receiver.toCell(),
        }.toCell(),
    });

    if (pending.replyTo != null) {
        val notify = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: pending.replyTo!,
            body: TokenPool_ReleaseOrMintFinished {
                queryId: msg.queryId,
                out: pending.out,
            },
        });
        notify.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

fun onReleaseTransferBounced(
    mutate st: Storage,
    sender: address,
    msg: AskToTransfer,
) {
    val jettonClient = st.poolData.load().jettonClient();
    assert(jettonClient.isWallet(sender), Error.UnexpectedReleaseBounce);

    val pendingEntry = st.pendingReleases.get(msg.queryId);
    assert(pendingEntry.isFound, Error.PendingReleaseNotFound);

    val pending = pendingEntry.loadValue().load();
    st.pendingReleases.delete(msg.queryId);

    // TODO: should use shared onBouncedMessage handler from TokenPool lib to
    // reuse the logic across pool implementations.
    // The release consumed inbound rate-limit capacity at admission, but the transfer
    // bounced so no tokens were delivered. Return that capacity to the bucket.
    val request = lazy pending.request.load();
    val details = lazy request.transfer.details.load();
    val out = lazy pending.out.load();
    var pool: TokenPool<Storage> = loadPool(st);
    pool.releaseInboundRateLimit(details.remoteChainSelector, out.destinationAmount);
    st.poolData = pool.data.toCell();

    // TODO: we should always reply back
    if (pending.replyTo != null) {
        val fail = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: pending.replyTo!,
            body: TokenPool_ReleaseOrMintFailure {
                queryId: msg.queryId,
                errorCode: Error.UnexpectedReleaseBounce as uint16,
            },
        });
        fail.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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

get fun hasPendingRelease(queryId: uint64): bool {
    return Storage.load().pendingReleases.get(queryId).isFound;
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
    amount: uint256,
    feeToken: address,
    requestedFinalityConfig: uint32,
    tokenArgs: cell?,
): (uint256, uint32, uint32, uint16, bool) {
    val pool = loadPool(Storage.load());
    return pool.getFee(localToken, destChainSelector, amount, feeToken, requestedFinalityConfig, tokenArgs);
}

/// Calculates the fee amount based on the transfer details and finality config.
get fun getFeeAmount(
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): uint256 {
    val pool = loadPool(Storage.load());
    return pool.getFeeAmount(transfer, requestedFinalityConfig);
}
