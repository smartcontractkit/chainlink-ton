import "messages"
import "storage"
import "errors"
import "../onramp/messages"
import "../onramp/types"
import "../common/types"
import "../common/messages"
import "../../lib/access/ownable_2step"
import "../../lib/funding/withdrawable.tolk"
import "../../deployable/types"
import "../../lib/access/ownable_2step"
import "../../lib/utils"
import "../../lib/jetton/messages"
import "../../lib/jetton/messages_extended"
import "../../lib/versioning/upgradeable"


const CONTRACT_VERSION = "0.0.6";
const RESERVE = ton("1"); // TODO: set correct value

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        Router_SetRamps => {onSetRamps(msg, in.senderAddress)}
        Router_CCIPSend => { onSend(msg, in.senderAddress) }
        Common_JettonTransferNotification => { onTransferNotification(msg, in.senderAddress) }
        Withdrawable_Withdraw => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            Withdrawable{
                reserve: RESERVE
            }.withdraw(msg, in.valueCoins);
        }
        Upgradeable_Upgrade => { onUpgrade(msg, in.senderAddress) }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
}

fun onSetRamps(msg: Router_SetRamps, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);

    var selectors = msg.destChainSelectors.iter();
    while (!selectors.empty()) {
        val selector = selectors.next();
        st.onRamps.set(selector, msg.onRamp);
    }
    st.store();
}

// TODO: emit(OnRampsSet)

fun onSend(msg: Router_CCIPSend, sender: address) {
    ccipSend(msg, sender);
}

fun onTransferNotification(transferNotification: Common_JettonTransferNotification, wallet: address) {
    val st = lazy Storage.load();

    // TBD: I think we don't need to validate the sender here. If it is not a Jetton Wallet, it would not be able to transfer the jettons?

    // TODO: need to validate that the transfer notification came from our own wallet
    // assert(sender == st.owner) throw Error.NotOwner;
    // TODO: need to validate the jetton (master) address, but to do this we need to
    // derive the address. We can probably fetch that from the ccip send payload's tokenAmounts

    // TODO: catch errors, if different message type than CCIPSend
    val sendMsg = Router_CCIPSend.fromCell(transferNotification.forwardPayload!);
    var tokenAmounts = sendMsg.tokenAmounts.iter();
    // TODO handle payment in LINK if this is a LINK transfer
    assert (!tokenAmounts.empty()) throw 0xFFFF; // TODO: proper error code for no token amounts
    val transferedJetton = tokenAmounts.next();
    assert (transferedJetton.amount == transferNotification.amount) throw 5; // TODO: if transfered token is link, extract fee before this check
    assert (tokenAmounts.empty()) throw 0xFFFF; // TODO: proper error code for only supporting single token transfers

    // TODO: store msg.amount + value
    // make sure msg.amount == sendMsg.token amount
    val onRamp = st.onRamps.mustGet(sendMsg.destChainSelector, Error.DestChainNotEnabled as int);

    val transferMessage = createMessage({
        bounce: true,
        value: 0, // TODO:
        dest: wallet,
        body: AskToTransferFwdPayload {
            queryId: sendMsg.queryId,
            jettonAmount: transferNotification.amount,
            transferRecipient: onRamp,
            sendExcessesTo: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: ton("0.5"), // TODO
            forwardPayload: OnRamp_Send { msg: sendMsg.toCell(), metadata: Metadata{ sender: transferNotification.sender } }.toCell(),
        },
    });
    transferMessage.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);


    // Forward excesses
    // self.forward(msg.sender, null, false, null);
}

fun ccipSend(msg: Router_CCIPSend, sender: address) {
    val st = lazy Storage.load();

    // forward to onRamp
    // ccipSend(onRamp, msg, value/token amounts)

    val onRamp = st.onRamps.mustGet(msg.destChainSelector, Error.DestChainNotEnabled as int);
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRamp,
        body: OnRamp_Send { msg: msg.toCell(), metadata: Metadata{ sender } },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onUpgrade(msg: Upgradeable_Upgrade, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);
    Upgradeable{ migrate, version }.upgrade(msg);
}

@method_id(1000)
fun migrate(storage: cell, version: slice): cell { throw Upgradeable_Error.VersionMismatch; }

@method_id(1001)
fun version(): slice { return CONTRACT_VERSION; }

get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.Router", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.ccip.Router"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.Router"), local);
}

get fun onRamp(destChainSelector: uint64): address {
    val st = lazy Storage.load();
    return st.onRamps.mustGet(destChainSelector, Error.DestChainNotEnabled as int);
}

get fun destChainSelectors(): tuple {
    val st = lazy Storage.load();
    var d = st.onRamps;
    return keysLispList(d)!;
}

get fun reserve(): coins {
    return RESERVE;
}

