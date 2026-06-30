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

contract BurnMintTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.BurnMintTokenPool"

    storage: Storage
    incomingMessages:
        | TokenPool_InMessage
        | BurnMintTokenPool_InMessage
    outgoingMessages:
        | TokenPool_OutMessage
        | BurnMintTokenPool_OutMessage
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

    val msg = lazy BurnMintTokenPool_InMessage.fromSlice(in.body);
    match (msg) {
        BurnMintTokenPool_ClaimMinterAdmin => {
            onClaimMinterAdmin(mutate st, in.senderAddress, msg.queryId);
            st.store();
        }
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
}

/// @notice Token pool used for burn and mint tokens. This uses a burn and mint mechanism.
/// @dev One token per BurnMintTokenPool. In this variant the pool contract owns the Jetton wallet and the Jetton minter admin role.
fun onLockOrBurnTransferContinue(
    st: Storage,
    sender: address,
    fwdPayload: TokenPool_LockOrBurnForwardPayload,
): Storage {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val prepared = lazy fwdPayload.prepared.load();

    assert(!st.pendingBurns.get(requestMsg.queryId).isFound, BurnMintTokenPool_Error.PendingBurnAlreadyExists);

    val jettonClient = st.poolData.load().jettonClient();
    st.pendingBurns.set(requestMsg.queryId, BurnMintTokenPool_PendingBurn {
        forwardPayload: fwdPayload,
        expectedSender: jettonClient.masterAddress,
    }.toCell());

    val burnMsg = createMessage({
        bounce: BounceMode.RichBounce, // used to recover sendExcessesTo address (context)
        value: BurnMintTokenPool_BURN_VALUE,
        dest: sender,
        body: AskToBurn {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount as coins,
            sendExcessesTo: contract.getAddress(), // TODO: use ContextExecutor addr as proxy
            customPayload: null,
        },
    });
    burnMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);

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
    assert(!st.pendingMints.get(msg.queryId).isFound, BurnMintTokenPool_Error.PendingMintAlreadyExists);
    val jettonClient = st.poolData.load().jettonClient();
    val request = lazy prepared.request.load();
    val details = lazy request.transfer.details.load();

    val recipientWallet = calcAddressOfJettonWallet(
        details.receiver,
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );

    // TODO: use transfer.id

    st.pendingMints.set(msg.queryId, BurnMintTokenPool_PendingMint {
        replyTo: msg.replyTo,
        request: request.toCell(),
        out: prepared.out.toCell(),
        expectedSender: recipientWallet,
    }.toCell());

    val mint = createMessage({
        bounce: BounceMode.RichBounce, // used to recover sendExcessesTo address (context)
        value: BurnMintTokenPool_MINT_VALUE,
        dest: jettonClient.masterAddress,
        body: MintNewJettons {
            queryId: msg.queryId,
            mintRecipient: details.receiver,
            tonAmount: BurnMintTokenPool_MINT_VALUE,
            internalTransferMsg: InternalTransferStep {
                queryId: msg.queryId,
                jettonAmount: prepared.localAmount as coins,
                transferInitiator: null,
                sendExcessesTo: contract.getAddress(),
                forwardTonAmount: 0,
                forwardPayload: beginCell().storeUint(0, 1).endCell().beginParse(),
            }.toCell(),
        },
    });
    mint.send(SEND_MODE_PAY_FEES_SEPARATELY);

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

fun onReturnExcessesBack(
    mutate st: Storage,
    sender: address,
    msg: ReturnExcessesBack,
) {
    val burnEntry = st.pendingBurns.get(msg.queryId);
    if (burnEntry.isFound) {
        val pending = burnEntry.loadValue().load();
        assert(sender == pending.expectedSender, BurnMintTokenPool_Error.UnexpectedBurnConfirmationSender);

        st.pendingBurns.delete(msg.queryId);

        var pool = loadPool(st);
        return pool.onLockOrBurnTransferFinalize(pending.forwardPayload);
    }

    val mintEntry = st.pendingMints.get(msg.queryId);
    assert(mintEntry.isFound, BurnMintTokenPool_Error.PendingMintNotFound);

    val pending = mintEntry.loadValue().load();
    assert(sender == pending.expectedSender, BurnMintTokenPool_Error.UnexpectedMintConfirmationSender);

    st.pendingMints.delete(msg.queryId);
    val request = pending.request.load();
    val details = request.transfer.details.load();
    val out = pending.out.load();

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
            postflightCheck: null,
            onReleaseOrMintContinue,
        },
    };
}

get fun typeAndVersion(): (slice, slice) {
    return (BurnMintTokenPool_CONTRACT_NAME, BurnMintTokenPool_CONTRACT_VERSION);
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

get fun hasPendingBurn(queryId: uint64): bool {
    return Storage.load().pendingBurns.get(queryId).isFound;
}

get fun hasPendingMint(queryId: uint64): bool {
    return Storage.load().pendingMints.get(queryId).isFound;
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
