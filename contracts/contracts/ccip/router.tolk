import "types.tolk";
import "../deployable/types.tolk";
import "utils.tolk";

struct Storage {
    owner: address;

    // TODO: expand this with versions support
    onRamp: address;
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = CCIPSend | JettonTransferNotification;

fun onInternalMessage(msgCell: cell, msgBody: slice) {
    val msg = Msg.fromSlice(msgBody);
    match (msg) {
        CCIPSend => { onSend(msg) }
        JettonTransferNotification => { onTransferNotification(msgCell, msg) }
    }
}

fun onSend(msg: CCIPSend) {
    ccipSend(msg);  

    // Forward excesses
    // self.forward(msg.sender, null, false, null);
}

fun onTransferNotification(msgCell: cell, msg: JettonTransferNotification) {
    var cs: slice = msgCell.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    val st = Storage.load();
    val sender: address = cs.loadAddress();

    // TODO: need to validate that the transfer notification came from our own wallet
    assert(sender == st.owner) throw ERROR_NOT_OWNER;
    // TODO: need to validate the jetton (master) address, but to do this we need to
    // derive the address. We can probably fetch that from the ccip send payload's tokenAmounts

    // TODO: catch errors, if different message type than CCIPSend
    val sendMsg: CCIPSend = msg.forwardPayload!.load();

    // TODO: store msg.amount + value
    // make sure msg.amount == sendMsg.token amount

    ccipSend(sendMsg);

    // Forward excesses
    // self.forward(msg.sender, null, false, null);
}

fun ccipSend(msg: CCIPSend) {
    val st = Storage.load();

    // call into onramp
    // ccipSend(onRamp, msg, value/token amounts)        
    val sendMsg = createMessage({
        bounce: true,
        value: 0,
        dest: st.onRamp,
        // body: Send { msg },
    });
    sendMsg.send(SEND_MODE_REGULAR);
}

// TypeAndVersion
//
// override fun type(): String {
//     return "com.chainlink.ton.ccip.Router";
// }
//
// override fun version(): String {
//     return "1.0.0";
// }
