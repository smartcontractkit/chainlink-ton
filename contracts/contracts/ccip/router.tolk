import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../deployable/types.tolk";
import "../lib/utils.tolk";
import "../lib/jetton/messages"
import "../lib/jetton/messages_extended"

struct Storage {
    ownable: Ownable2Step;

    // TODO: expand this with versions support
    onRamps: map<uint64, address>; // destChainSelector -> onRamp address
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = CCIPSend | SetRamp | JettonTransferNotification;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        SetRamp => { onSetRamp(msg, in.senderAddress) }
        CCIPSend => { onSend(msg, in.senderAddress) }
        JettonTransferNotification => { onTransferNotification(msg, in.senderAddress) }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
}

fun onSetRamp(msg: SetRamp, sender: address) {
    var st = lazy Storage.load();
    st.ownable.requireOwner(sender);

    st.onRamps.set(msg.destChainSelector, msg.onRamp);
    st.store();

    // TODO: emit(OnRampSet)
}

fun onSend(msg: CCIPSend, sender: address) {
    ccipSend(msg, sender);
}

fun onTransferNotification(transferNotification: JettonTransferNotification, wallet: address) {
    val st = lazy Storage.load();

    // TBD: I think we don't need to validate the sender here. If it is not a Jetton Wallet, it would not be able to transfer the jettons?

    // TODO: need to validate that the transfer notification came from our own wallet
    // assert(sender == st.owner) throw ERROR_NOT_OWNER;
    // TODO: need to validate the jetton (master) address, but to do this we need to
    // derive the address. We can probably fetch that from the ccip send payload's tokenAmounts

    // TODO: catch errors, if different message type than CCIPSend
    val sendMsg = CCIPSend.fromCell(transferNotification.forwardPayload!);
    var tokenAmounts = Iterator<TokenAmount>.new(sendMsg.tokenAmounts);
    // TODO handle payment in LINK if this is a LINK transfer
    assert (!tokenAmounts.empty()) throw 0xFFFF; // TODO: proper error code for no token amounts
    val transferedJetton = tokenAmounts.next();
    assert (transferedJetton.amount == transferNotification.amount) throw 5; // TODO: if transfered token is link, extract fee before this check
    assert (tokenAmounts.empty()) throw 0xFFFF; // TODO: proper error code for only supporting single token transfers

    // TODO: store msg.amount + value
    // make sure msg.amount == sendMsg.token amount
    val onRamp = st.onRamps.mustGet(sendMsg.destChainSelector, ERROR_DEST_CHAIN_NOT_ENABLED);

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
            forwardPayload: OnRampSend { msg: sendMsg.toCell(), metadata: Metadata{ sender: transferNotification.sender } }.toCell(),
        },
    });
    transferMessage.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);


    // Forward excesses
    // self.forward(msg.sender, null, false, null);
}

fun ccipSend(msg: CCIPSend, sender: address) {
    val st = lazy Storage.load();

    // forward to onRamp
    // ccipSend(onRamp, msg, value/token amounts)

    val onRamp = st.onRamps.mustGet(msg.destChainSelector, ERROR_DEST_CHAIN_NOT_ENABLED);
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: onRamp,
        body: OnRampSend { msg: msg.toCell(), metadata: Metadata{ sender } },
    });
    sendMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.Router", "1.0.0");
 }

get fun onRamp(destChainSelector: uint64): address {
    val st = lazy Storage.load();
    return st.onRamps.mustGet(destChainSelector, ERROR_DEST_CHAIN_NOT_ENABLED);
}

get fun destChainSelectors(): tuple {
    val st = lazy Storage.load();
    var d = st.onRamps;
    return keysLispList(d)!;
}
