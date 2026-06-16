// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "../../../lib/utils"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton-utils"
import "../../../lib/jetton/jetton_client"
import "../../rmn_remote/lib"
import "../token_pool"
import "../types"
import "../messages"
import "../events"
import "../errors"

import "messages"
import "types"
import "errors"
import "storage"

contract LockReleaseTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.LockReleaseTokenPool"

    storage: Storage
    incomingMessages: TokenPool_InMessage | LockReleaseTokenPool_InMessage // TODO: all incoming messages should be registered
}

// TODO:
// _lockOrBurn -> after async checks, (1) does nothing, or (2) deposits to the Lockbox
// _releaseOrMint -> after async checks, (1) transfers from own wallet, or (2) withdraws from the Lockbox

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
            onReturnExcessesBack(mutate st, msg, in.senderAddress);
            st.store();
        }
        else => {
            assert(in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy LockReleaseTokenPool_BouncedMessage.fromSlice(in.bouncedBody.skipBouncedPrefix());
    match (msg) {
        AskToTransfer => {
            var st = Storage.load();
            onReleaseTransferBounced(mutate st, msg, in.senderAddress);
            st.store();
        }
    }
}

/// @notice Token pool used for tokens on their native chain. This uses a lock and release mechanism.
/// @dev One token per LockReleaseTokenPool. In this non-lockbox variant the pool contract's Jetton wallet holds custody directly.
fun onLockOrBurnTransfer(
    st: Storage, // TODO: should be TokenPool<Storage> so I get access to hooks and context
    sender: address,
    msg: TransferNotificationForRecipient,
): Storage {

    // TODO: duplicated code with burn/mint TP 
    var isValidPayload = true; // TODO: safely inspect the payload
    val fwdps = loadForwardPayloadAsSlice(msg.forwardPayload);
    val fwdp = TokenPool_LockOrBurnForwardPayload.fromSlice(fwdps!);
    val requestMsg = lazy fwdp.requestMsg.load();
    val prepared = lazy fwdp.prepared.load();

    // TODO: can we trust (any) JettonWallet forward payloads?
    // assert(request.amount == msg.jettonAmount, TokenPool_Error.AmountMismatch);

    // TODO: check msg.transferInitiator is Router (or best effort return)
    val router = createAddressNone();
    if (msg.transferInitiator == null || msg.transferInitiator! != router || !isValidPayload) {
        // TODO: check available gas, we don't want to drain the contract with return transfers
        // send back the tokens, we don't support direct transfers to the pool
        val returnTransfer = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: sender,
            body: AskToTransfer {
                queryId: msg.queryId,
                jettonAmount: msg.jettonAmount,
                transferRecipient: msg.transferInitiator!,
                sendExcessesTo: msg.transferInitiator,
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: beginCell().storeBool(false).endCell().beginParse(),
            },
        });
        returnTransfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

        return st;
    }

    var request = requestMsg.request.load();
    emit(TOKEN_POOL_LOCKED_OR_BURNED_TOPIC, TokenPool_LockedOrBurned {
        remoteChainSelector: request.remoteChainSelector,
        details: TokenPool_LockedOrBurnedDetails {
            token: request.localToken,
            sender: msg.transferInitiator!,
            amount: prepared.destTokenAmount,
        }.toCell(),
    });

    // TODO: we should reply in any case, send a message to the OnRamp to indicate that the lockOrBurn was processed
    if (requestMsg.replyTo != null) {
        createMessage({
            bounce: true,
            value: 0,
            dest: requestMsg.replyTo!,
            body: TokenPool_LockOrBurnResponse {
                queryId: requestMsg.queryId,
                out: prepared.out.toCell(),
                destTokenAmount: prepared.destTokenAmount,
            },
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }

    return st;
}

fun handleReleaseOrMintMessage(
    ctx: Storage?,
    sender: address,
    msg: TokenPool_ReleaseOrMint,
    prepared: TokenPool_ReleaseOrMintPrepared,
): Storage? {
    assert(ctx != null, TokenPool_Error.UnsupportedOperation);
    var st = ctx!;
    assert(!st.pendingReleases.get(msg.queryId).isFound, Error.PendingReleaseAlreadyExists);
    val jettonClient = st.jettonClient.load();

    val request = prepared.request.load();

    val recipientWallet = calcAddressOfJettonWallet(
        request.receiver,
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    st.pendingReleases.set(msg.queryId, LockReleaseTokenPool_PendingRelease {
        replyTo: msg.replyTo,
        request: request.toCell(),
        out: prepared.out.toCell(),
        expectedSender: recipientWallet,
    }.toCell());

    jettonClient.sendSimple(
        JettonMessageOptions {
            bounce: true,
            value: LockReleaseTokenPool_RELEASE_TRANSFER_VALUE,
        },
        SEND_MODE_PAY_FEES_SEPARATELY,
        msg.queryId,
        prepared.localAmount as coins,
        request.receiver,
        contract.getAddress(),
    );

    return st;
}

fun onReturnExcessesBack(
    mutate st: Storage,
    msg: ReturnExcessesBack,
    sender: address,
) {
    val pendingEntry = st.pendingReleases.get(msg.queryId);
    assert(pendingEntry.isFound, Error.PendingReleaseNotFound);

    val pending = pendingEntry.loadValue().load();
    assert(sender == pending.expectedSender, Error.UnexpectedReleaseConfirmationSender);

    st.pendingReleases.delete(msg.queryId);
    val request = pending.request.load();
    val out = pending.out.load();

    emit(TOKEN_POOL_RELEASED_OR_MINTED_TOPIC, TokenPool_ReleasedOrMinted {
        remoteChainSelector: request.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: request.localToken,
            amount: out.destinationAmount,
            participants: TokenPool_ReleasedOrMintedParticipants {
                sender: contract.getAddress(),
                recipient: request.receiver,
            }.toCell(),
        }.toCell(),
    });

    if (pending.replyTo != null) {
        createMessage({
            bounce: true,
            value: LockReleaseTokenPool_REPLY_VALUE,
            dest: pending.replyTo!,
            body: TokenPool_ReleaseOrMintResponse {
                queryId: msg.queryId,
                out: pending.out,
            },
        }).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
}

fun onReleaseTransferBounced(
    mutate st: Storage,
    msg: AskToTransfer,
    sender: address,
) {
    val jettonClient = st.jettonClient.load();
    assert(jettonClient.isWallet(sender), Error.UnexpectedReleaseBounce);

    val pendingEntry = st.pendingReleases.get(msg.queryId);
    assert(pendingEntry.isFound, Error.PendingReleaseNotFound);

    val pending = pendingEntry.loadValue().load();
    st.pendingReleases.delete(msg.queryId);

    if (pending.replyTo != null) {
        createMessage({
            bounce: true,
            value: LockReleaseTokenPool_REPLY_VALUE,
            dest: pending.replyTo!,
            body: TokenPool_ReleaseOrMintFailure {
                queryId: msg.queryId,
                errorCode: Error.UnexpectedReleaseBounce as uint16,
            },
        }).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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
            preflightCheck: null,
            postflightCheck: null,
            applyLockOrBurn: null,
            applyReleaseOrMint: null,
            onLockOrBurn: null,
            validateLockOrBurn: null,
            onLockOrBurnTransfer,
            handleReleaseOrMintMessage,
        },
    };
}

get fun typeAndVersion(): (slice, slice) {
    return (LockReleaseTokenPool_CONTRACT_NAME, LockReleaseTokenPool_CONTRACT_VERSION);
}

get fun token(): address {
    return Storage.load().poolData.load().token;
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
