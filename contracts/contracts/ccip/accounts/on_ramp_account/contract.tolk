// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "@stdlib/gas-payments"

import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"
import "../../../lib/jetton/jetton-utils"
import "../../common/types"

import "types"
import "messages"
import "storage"

/// Per-user deposit account deployed for CCIP source-chain token sends.
///
/// A user sends jettons to this account together with (optionally) a
/// `Router_CCIPSend` message embedded in the jetton transfer's forward payload.
/// This account then:
///   - forwards deposited jettons + the `Router_CCIPSend` to the Router (beneficiary)
///     so the send can proceed, or
///   - simply keeps the jettons (deposit-only) for a later, asynchronous send, or
///     an owner withdrawal.
///
/// Owners and the Router (beneficiary) can withdraw jettons at any time. This mirrors
/// the reactive model of `OffRampAccount`: rather than the router pushing tokens out on
/// its own, the Router issues an `OnRampAccount_Withdraw` and this account delegates to
/// its own jetton wallet via `AskToTransfer`.
///
/// The account is authenticated by derivation: its deterministic address comes from
/// `(code, owner, beneficiary)`, which lets a token pool verify a deposit source purely
/// by recomputing this address + the account's jetton wallet (see Deployables auth).
contract OnRampAccount {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.OnRampAccount"

    storage: OnRampAccount_Data
    incomingMessages:
        | OnRampAccount_InMessage
    outgoingMessages:
        | OnRampAccount_OutMessage
}

/// Dispatches incoming messages: Init from a known party, Withdraw from owner/beneficiary,
/// and deposit notifications from this account's own jetton wallet. Everything else bounces.
fun onInternalMessage(in: InMessage) {
    var data = OnRampAccount_Data.load();
    val msg = lazy OnRampAccount_InMessage.fromSlice(in.body);

    match (msg) {
        OnRampAccount_Init => {
            onInit(mutate data, in.senderAddress, msg);
            data.store();
        }
        OnRampAccount_Withdraw => {
            onWithdraw(data, in.senderAddress, msg);
        }
        // Deposit notifications always arrive from this account's own jetton wallet.
        // They may carry a Router_CCIPSend that we forward to the beneficiary.
        TransferNotificationForRecipient => {
            onDepositNotification(mutate data, in.senderAddress, msg);
            data.store();
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Configures the account with its jetton identity.
/// @dev Computes this account's own jetton wallet from the provided JettonClient. The
///      sender must be the owner or the beneficiary (Router) of the account.
/// @dev Note: account addresses are deterministic from (code, owner, beneficiary). Because
///      the jetton identity is part of data but NOT of address derivation, this contract
///      must be initialized exactly once and its `jettonClient` must match the token the
///      account was created for.
fun onInit(mutate data: OnRampAccount_Data, sender: address, msg: OnRampAccount_Init) {
    assert(sender == data.owner || sender == data.beneficiary, OnRampAccount_Error.OnlyOwnerOrBeneficiary);
    assert(data.jettonClient == null, OnRampAccount_Error.AlreadyInit);

    data.jettonClient = msg.jettonClient.toCell();

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: OnRampAccount_InitAck {
            queryId: msg.queryId,
            jettonWallet: getJettonWalletOf(data),
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Allows `owner` or `beneficiary` (Router) to transfer jettons out of this account's wallet.
/// @dev Sends `AskToTransfer` to the wallet directly. The Router uses this to move deposited
///      funds into a token pool to complete a CCIP send.
fun onWithdraw(data: OnRampAccount_Data, sender: address, msg: OnRampAccount_Withdraw) {
    assert(sender == data.owner || sender == data.beneficiary, OnRampAccount_Error.OnlyOwnerOrBeneficiary);

    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: msg.walletAddress,
        body: msg.ask,
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Handles a deposit notification from this account's jetton wallet.
/// @dev If the inbound transfer carried a `Router_CCIPSend` in its forward payload, forwards
///      the jettons + CCIPSend to the Router (beneficiary); otherwise the account simply holds
///      the jettons (default deposit) for later withdrawal or an async send.
/// @dev The Router recognizes a CCIPSend only when it arrives on the Router's own wallet via a
///      TransferNotificationForRecipient whose forwardPayload embeds the CCIPSend as a ref.
fun onDepositNotification(mutate data: OnRampAccount_Data, sender: address, msg: TransferNotificationForRecipient) {
    assert(getJettonWalletOf(data) == sender, OnRampAccount_Error.OnlyOwnWallet);

    val ccipSendCell = loadForwardPayloadAsCell(msg.forwardPayload);
    if (ccipSendCell == null) {
        // Deposit-only: no CCIPSend to forward. Jettons stay under this account's custody,
        // and the owner can issue a CCIPSend later or withdraw at any time.
        return;
    }

    // TODO: check that the CCIPSend payload can be parsed

    // Forward to the beneficiary (CCIP Router)
    val forward = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: getJettonWalletOf(data),
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.jettonAmount,
            transferRecipient: data.beneficiary,
            sendExcessesTo: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: ton("0.01"),
            forwardPayload: beginCell()
                .storeMaybeRef(ccipSendCell!)
                .endCell()
                .beginParse(),
        },
    });
    forward.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Derives this account's own jetton wallet address from its jetton identity.
@inline
fun getJettonWalletOf(data: OnRampAccount_Data): address {
    assert(data.jettonClient != null, OnRampAccount_Error.NotInitialized);
    val jc = data.jettonClient!.load();
    return calcAddressOfJettonWallet(
        contract.getAddress(),
        jc.masterAddress,
        jc.jettonWalletCode,
    );
}

get fun typeAndVersion(): (slice, slice) {
    return (OnRampAccount_CONTRACT_NAME, OnRampAccount_CONTRACT_VERSION);
}

get fun getOwner(): address {
    val data = lazy OnRampAccount_Data.load();
    return data.owner;
}

get fun getBeneficiary(): address {
    val data = lazy OnRampAccount_Data.load();
    return data.beneficiary;
}

get fun getJettonWallet(): address? {
    val data = lazy OnRampAccount_Data.load();
    return data.jettonClient == null
        ? null
        : getJettonWalletOf(data);
}
