// initialize the contract as a stub with stateInit = {
//   owner: myAddr, type: "OnRamp", id: "some identifier, could also be a complex tuple"
// }
struct Deployable {
    owner: address;
    ty: cell;
    id: cell;
}

struct Initialize {
    data: cell;
    code: cell;
}

const ERROR_NOT_OWNER: int = 0x1;

fun onInternalMessage(inMsgFull: cell, inMsgBody: slice) {
    var cs: slice = msgCell.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    val st = Deployable.load();
    val sender: address = cs.loadAddress();

    assert(sender == st.owner) throw ERROR_NOT_OWNER;

    val payload = Initialize.fromCell(inMsgBody);
    inMsgBody.assertEnd();
    contract.setData(payload.data);
    contract.setCodePostponed(payload.code);
}
