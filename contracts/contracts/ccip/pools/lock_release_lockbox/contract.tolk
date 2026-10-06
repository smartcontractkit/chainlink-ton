// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.2

import "@stdlib/lisp-lists"
import "@stdlib/gas-payments"

import "../../../lib/utils"
import "../../../lib/access/access_control"
import "../../../lib/access/ownable_2step"
import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/jetton-utils"
import "../../../lib/funding/jetton_withdrawable"

import "../../common/types"
import "../../accounts/deposit/messages"
import "../../accounts/deposit/types"
import "../../rmn_remote/lib"

import "../../../lib/deployable/types"

import "../../../../gen/Deployable.code"
import "../../../../gen/DepositAccount.code"

import "../lib/token_pool/entrypoint"
import "../lib/token_pool/recovery"
import "../lib/token_pool/types"
import "../lib/token_pool/messages"
import "../lib/token_pool/errors"
import "../lockbox/messages"

import "messages"
import "types"
import "storage"


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
    if (tryHandleRejectedDepositReturn(st, in.senderAddress, in.valueCoins, in.body)) {
        return;
    }
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
        JettonLockBox_DepositFailed => {
            onDepositFailed(mutate st, in.senderAddress, msg, in.valueCoins);
            st.store();
        }
        JettonLockBox_WithdrawFailed => {
            onWithdrawFailed(mutate st, in.senderAddress, msg, in.valueCoins);
            st.store();
        }
        DepositAccount_Reply => {
            onDepositAccountReply(mutate st, in.senderAddress, msg);
            st.store();
        }
        DepositAccount_NotEnoughValue => {
            onDepositAccountInitFailed(mutate st, in.senderAddress, msg);
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
///
/// The account is deployed via the Deployable pattern with a two-message sequence: the pool sends
/// `Deployable_Initialize` to the account's deterministic shell address, which upgrades into the
/// account by installing the account's code/data, then sends `DepositAccount_Init` (carrying the
/// release context as forward payload, so the account's `DepositAccount_Reply` back to the pool
/// can be correlated to the release). The two messages are enqueued and processed in order.
/// owner = pool (deploys the account and receives the Reply), proxy = pool,
/// beneficiary = recipient (can withdraw released jettons).
///
/// @dev Idempotent: if the account is already deployed, the `Deployable_Initialize` bounces off
///      the upgraded account (opcode mismatch — ignored by the pool's bounce handler), while the
///      `DepositAccount_Init` still succeeds and re-confirms the account, so a retried release to
///      the same recipient safely re-confirms the account.
fun deployOffRampAccountWithRelease(
    st: Storage,
    recipient: address,
    queryId: uint64,
    context: LockReleaseLockboxTokenPool_ReleaseContext,
) {
    val poolAddr = contract.getAddress();
    var beneficiaries: map<address, ()> = [];
    beneficiaries.set(recipient, ());

    val oaa = calcAddressOfDepositAccount(
        deployableCode(),
        poolAddr, // owner = pool (deploys the account)
        recipient,
    );

    val ESTIMATE_FWD_FEE = grams("0.02"); // TODO

    // 1. Install the account's code/data at the shell address. On a retry to an already-deployed
    // account this bounces with the default opcode-mismatch exit code (63) — ignored by the pool.
    val deploy = createMessage({
        bounce: BounceMode.RichBounce,
        value: DepositAccount_MIN_GRAM_TO_RESERVE + ESTIMATE_FWD_FEE,
        dest: oaa,
        body: Deployable_Initialize {
            stateInit: ContractState {
                code: depositAccountCode(),
                data: DepositAccount_Data {
                    owner: poolAddr,
                    proxy: poolAddr,
                    beneficiaries,
                }.toCell(),
            },
        },
    });
    // TODO require the incomming value to be more than DepositAccount_MIN_GRAM_TO_RESERVE + ESTIMATE_FWD_FEE + DepositAccount_MIN_GRAM_TO_INIT
    deploy.send(SEND_MODE_REGULAR + SEND_MODE_BOUNCE_ON_ACTION_FAIL);

    // The remaining value should be at least DepositAccount_MIN_GRAM_TO_INIT
    reserveGramsOnBalance(0, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE);

    // 2. Init the freshly installed account (processed right after the deploy). The account
    // replies `DepositAccount_Reply` to the pool (its owner), which continues the release.
    val init = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: oaa.calculateAddress(),
        body: DepositAccount_Init {
            queryId,
            forwardPayload: context.toCell(),
        },
    });
    // SAFETY: reserveGramsOnBalance is called before sending the init message, ensuring the account has enough balance to cover the reserved grams.
    init.send(SEND_MODE_CARRY_ALL_BALANCE + SEND_MODE_BOUNCE_ON_ACTION_FAIL);
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
    val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val prepared = lazy operation.prepared.load();
    val requestIn = lazy operation.requestMsg.load().request.load();
    val details = lazy requestIn.transfer.details.load();

    // Validate sender: derive expected account address and verify. Owner = proxy = pool,
    // beneficiary = the final recipient.
    val poolAddr = contract.getAddress();
    val expectedOaa = calcAddressOfDepositAccount(
        deployableCode(),
        poolAddr, // owner = pool
        details.receiver,
    );
    assert(sender == expectedOaa.calculateAddress(), LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountReply);

    // Compute account's jetton wallet address (where lockbox should withdraw to).
    val jc = st.poolData.load().jettonClient();

    // Build extra with sendExcessesTo so ReturnExcessesBack routes to pool.
    // Also pass release context as forwardPayload so it survives the lockbox → jetton wallet hop.
    val withdrawExtra = JettonLockBox_WithdrawExtra {
        sendExcessesTo: poolAddr,
        failureContext: null,
        forwardTonAmount: grams("0.01"), // required for TransferNotificationForRecipient
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
            token: jc.masterAddress,
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
    var st = Storage.load();

    // Base library first recovers the messages it emits (GetCCVs query, LockOrBurnWithdraw).
    var basePool = loadPool(st);
    if (basePool.onBouncedMessage(in.senderAddress, in.bouncedBody, in.valueCoins)) {
        st.poolData = basePool.data.toCell();
        st.store();
        return;
    }

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

            onLockTransferBounced(mutate st, in.senderAddress, msg, in.valueCoins);
            st.store();
        }
        // The init message bounced: either the deployment failed (the account was never
        // initialized) or the account rejected the init. Refund the rate limit and reply with a
        // failure so the sender can retry instead of the release silently stalling.
        DepositAccount_Init => {
            onDepositAccountInitBounced(mutate st, in.senderAddress, msg, in.valueCoins);
            st.store();
        }
        // The lockbox rejected the withdraw request at entry, so no JettonLockBox_WithdrawFailed
        // follows. Unwind the admitted release from the context we embedded in `extra.forwardPayload`.
        JettonLockBox_Withdraw => {
            assert(in.senderAddress == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
            assert(msg.extra != null) throw LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed;
            val withdrawExtra = lazy msg.extra!.load();
            assert(withdrawExtra.forwardPayload != null) throw LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed;
            recoverReleaseFromLockboxContext(mutate st, withdrawExtra.forwardPayload!, in.valueCoins);
            st.store();
        }
    }
}

/// @notice Handles a bounced `DepositAccount_Init` (the second message of the DepositAccount
/// deployment sequence): refunds the inbound rate limit and sends a release failure reply. The
/// init carries the release context in its `forwardPayload`.
/// @dev A bounced `Deployable_Initialize` (the first message of the sequence) is intentionally
///      NOT handled: on a retry to an already-deployed account it bounces with the default
///      opcode-mismatch exit code (63) and must be ignored, and on a failed fresh deployment the
///      queued init bounces right after it and cancels the release here — handling both would
///      double-refund the rate limit.
fun onDepositAccountInitBounced(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_Init,
    msgValue: coins,
) {
    assert(msg.forwardPayload != null, LockReleaseLockBoxTokenPool_Error.OffRampAccountDeployFailed);
    val context = LockReleaseLockboxTokenPool_ReleaseContext.fromCell(msg.forwardPayload);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.recoverReleaseOrMintFailure(operation, LockReleaseLockBoxTokenPool_Error.OffRampAccountDeployFailed as uint16, msgValue);
    st.poolData = pool.data.toCell();
}

/// @notice Handles `DepositAccount_NotEnoughValue`: the account failed to initialize because the
/// init message carried less than `MIN_GRAM_TO_INIT` (the account replies instead of bouncing,
/// so the failure does not surface as a `DepositAccount_Init` bounce).
/// Same recovery as a bounced init: refund the rate limit and send a release failure reply
/// so the sender can retry with enough value. The deployment is idempotent.
fun onDepositAccountInitFailed(
    mutate st: Storage,
    sender: address,
    msg: DepositAccount_NotEnoughValue,
) {
    assert(msg.forwardPayload != null, LockReleaseLockBoxTokenPool_Error.OffRampAccountDeployFailed);
    val contextCell = msg.forwardPayload;
    val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(contextCell);
    val operation = lazy context.forwardPayload.load();
    val requestIn = lazy operation.requestMsg.load().request.load();
    val details = lazy requestIn.transfer.details.load();

    // Validate sender: derive the expected account address and verify. Owner = proxy = pool,
    // beneficiary = the final recipient.
    val poolAddr = contract.getAddress();
    val expectedOaa = calcAddressOfDepositAccount(
        deployableCode(),
        poolAddr, // owner = pool
        details.receiver,
    );
    assert(sender == expectedOaa.calculateAddress(), LockReleaseLockBoxTokenPool_Error.OffRampAccountDeployFailed);

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
    msgValue: coins,
): Storage {
    val requestMsg = lazy fwdPayload.requestMsg.load();
    val prepared = lazy fwdPayload.prepared.load();

    val context = LockReleaseLockboxTokenPool_LockContext {
        forwardPayload: fwdPayload.toCell(),
    };

    // Calculate addresses.
    val jettonClient = st.poolData.load().jettonClient();
    val ownWallet = jettonClient.walletAddress();

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
    var transferOpts = CreateMessageOptions<AskToTransfer> {
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: ownWallet,
        body: AskToTransfer {
            queryId: requestMsg.queryId,
            jettonAmount: prepared.destTokenAmount,
            transferRecipient: st.lockbox,
            sendExcessesTo: contract.getAddress(),
            customPayload: context.toCell(),
            forwardTonAmount: msgValue,
            forwardPayload: beginCell().storeMaybeRef(depositMsg.toCell()).endCell().beginParse(),
        },
    };

    // Quote the inbound value as an upper bound before reducing the forwarded amount.
    val forwardingFee = createMessage(transferOpts)
        .estimateFeeWithoutSending(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    val computeFee = calculateGasFee(contract.getAddress().getWorkchain(),
        getGasConsumedAtTheMoment() + DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS);
    val overhead = computeFee + forwardingFee + TokenPool_RETURN_TRANSFER_VALUE + contract.getStorageDuePayment();
    assert(msgValue > overhead, TokenPool_Error.InsufficientMessageValue);
    transferOpts.body.forwardTonAmount = msgValue - overhead;

    val transfer = createMessage(transferOpts);
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
    var pool = loadPool(st);
    val context = lazy LockReleaseLockboxTokenPool_LockContext.fromCell(msg.context!);
    pool.onLockOrBurnTransferFinalize(context.forwardPayload.load());
}

fun validateRejectedDeposit(st: Storage, msg: JettonLockBox_DepositFailed): TokenPool_LockOrBurnForwardPayload {
    val data = st.poolData.load();
    assert(msg.token == data.token() && msg.depositor == contract.getAddress(),
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(msg.context != null, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    val context = LockReleaseLockboxTokenPool_LockContext.fromCell(msg.context!);
    val operation = context.forwardPayload.load();
    val request = lazy operation.requestMsg.load();
    val details = lazy request.request.load().transfer.details.load();
    val prepared = lazy operation.prepared.load();
    assert(request.queryId == msg.queryId && details.localToken == msg.token
        && prepared.destTokenAmount == msg.amount,
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    return operation;
}

fun onDepositFailed(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_DepositFailed,
    msgValue: coins,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    if (msg.context == null) {
        return;
    }
    val operation = validateRejectedDeposit(st, msg);
    var pool = loadPool(st);
    pool.recoverLockOrBurnFailure(operation, msg.errorCode, msgValue);
    st.poolData = pool.data.toCell();
}

/// Intercepts custody returns from the pool's wallet with the lockbox as transfer initiator.
/// Ordinary or malformed payloads return false for the base pool dispatcher to handle.
/// Returns custody without refunding rate limits or issuing another operation result.
fun tryHandleRejectedDepositReturn(st: Storage, sender: address, msgValue: coins, body: slice): bool {
    if (body.remainingBitsCount() < 32 || body.preloadUint(32) != 0x7362d09c) {
        return false;
    }
    assert(st.poolData.load().jettonClient().isWallet(sender), TokenPool_Error.Unauthorized);

    // Attempt to parse the transfer notification and extract the forward payload.
    var notification: TransferNotificationForRecipient;
    var payload: slice? = null;
    try {
        notification = TransferNotificationForRecipient.fromSlice(body);
        payload = loadForwardPayloadAsSlice(notification.forwardPayload);
    } catch {
        return false;
    }

    // Attempt to parse the deposit failure message from the forward payload.
    var failure: JettonLockBox_DepositFailed;
    try {
        failure = JettonLockBox_DepositFailed.fromSlice(payload!);
    } catch {
        return false;
    }

    // Authenticate custody separately from the logical failure callback.
    assert(notification.transferInitiator != null
        && notification.transferInitiator! == st.lockbox,
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    assert(notification.jettonAmount == failure.amount,
        LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);

    val operation = validateRejectedDeposit(st, failure);

    reserveBalanceBeforeInMessage(msgValue);
    sendTokenPoolRecoveryReturn(msgValue, sender, createTokenPoolCustodyReturn(operation));

    return true;
}

fun onLockTransferBounced(
    mutate st: Storage,
    sender: address,
    msg: AskToTransfer,
    msgValue: coins,
) {
    assert(st.poolData.load().jettonClient().isWallet(sender)) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
    assert(msg.customPayload != null) throw LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce;
    val context = lazy LockReleaseLockboxTokenPool_LockContext.fromCell(msg.customPayload!);
    val operation = lazy context.forwardPayload.load();

    var pool = loadPool(st);
    pool.recoverLockOrBurnFailure(operation, LockReleaseLockBoxTokenPool_Error.UnexpectedLockBounce as uint16,
        msgValue, createTokenPoolCustodyReturn(operation));
    st.poolData = pool.data.toCell();
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
    deployOffRampAccountWithRelease(st, details.receiver, msg.queryId, context);

    return st;
}

fun onWithdrawFailed(
    mutate st: Storage,
    sender: address,
    msg: JettonLockBox_WithdrawFailed,
    msgValue: coins,
) {
    assert(sender == st.lockbox, LockReleaseLockBoxTokenPool_Error.UnexpectedLockboxConfirmationSender);
    // JettonLockBox_WithdrawFailed may or may not carry context depending on when it failed.
    // If context is present, unwind the admitted release and reply with a failure.
    if (msg.context != null) {
        recoverReleaseFromLockboxContext(mutate st, msg.context!, msgValue);
    }
}

/// Unwinds an admitted release whose lockbox withdraw did not complete
fun recoverReleaseFromLockboxContext(
    mutate st: Storage,
    contextCell: cell,
    msgValue: coins,
) {
    val context = lazy LockReleaseLockboxTokenPool_ReleaseContext.fromCell(contextCell);
    var pool = loadPool(st);
    pool.recoverReleaseOrMintFailure(context.forwardPayload.load(), LockReleaseLockBoxTokenPool_Error.LockBoxWithdrawFailed as uint16, msgValue);
    st.poolData = pool.data.toCell();
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

    // Validate sender: the forwarded notification must come from the account and its original
    // jetton wallet (the account's own derived CCT wallet for this pool's token).
    val releaseRecipient = getReleaseRecipientFromContext(contextCell);
    val jettonClient = st.poolData.load().jettonClient();
    val poolAddr = contract.getAddress();
    val expectedOaa = calcAddressOfDepositAccount(
        deployableCode(),
        poolAddr, // owner = pool
        releaseRecipient,
    );
    assert(sender == expectedOaa.calculateAddress(), LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountNotification);

    // The original message's sender must be the account's own CCT jetton wallet for this token,
    // proving a real release reached the account (not a spoofed arbitrary sender).
    val expectedWallet = calcAddressOfJettonWallet(
        expectedOaa.calculateAddress(),
        jettonClient.masterAddress,
        jettonClient.jettonWalletCode,
    );
    assert(forwarded.senderAddress == expectedWallet, LockReleaseLockBoxTokenPool_Error.InvalidOffRampAccountNotification);

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

fun deployableCode(): cell {
    return deployableCompiledCode();
}

fun depositAccountCode(): cell {
    return depositAccountCompiledCode();
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
