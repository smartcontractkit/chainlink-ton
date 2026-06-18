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
    incomingMessages:
        | TokenPool_InMessage
        | LockReleaseTokenPool_InMessage
    outgoingMessages:
        | TokenPool_OutMessage
        | LockReleaseTokenPool_OutMessage
    emittedEvents: TokenPool_Events
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

fun onReleaseOrMintContinue(
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
    sender: address,
    msg: ReturnExcessesBack,
) {
    val pendingEntry = st.pendingReleases.get(msg.queryId);
    assert(pendingEntry.isFound, Error.PendingReleaseNotFound);

    val pending = pendingEntry.loadValue().load();
    assert(sender == pending.expectedSender, Error.UnexpectedReleaseConfirmationSender);

    st.pendingReleases.delete(msg.queryId);
    val request = pending.request.load();
    val out = pending.out.load();

    emit(TOPIC_TOKEN_POOL_RELEASED_OR_MINTED, TokenPool_ReleasedOrMinted {
        remoteChainSelector: request.remoteChainSelector,
        details: TokenPool_ReleasedOrMintedDetails {
            token: request.localToken,
            sender: contract.getAddress(),
            recipient: request.receiver.toCell(),
            amount: out.destinationAmount,
        }.toCell(),
    });

    if (pending.replyTo != null) {
        createMessage({
            bounce: true,
            value: LockReleaseTokenPool_REPLY_VALUE,
            dest: pending.replyTo!,
            body: TokenPool_ReleaseOrMintFinished {
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
            onLockOrBurn: null,
            validateLockOrBurn: null,
            preflightCheck: null,
            onLockOrBurnTransfer: null,
            onLockOrBurnTransferContinue: null,
            onReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue,
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
