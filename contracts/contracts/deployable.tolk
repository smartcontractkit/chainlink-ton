// initialize the contract as a stub with stateInit = {
//   owner: myAddr, type: "OnRamp", id: "some identifier, could also be a complex tuple"
// }

import "types.tolk";

fun onInternalMessage(inMsgFull: cell, inMsgBody: slice) {
    var cs: slice = msgCell.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    val st = Deployable<RemainingBitsAndRefs>.load();
    val sender: address = cs.loadAddress();
    assert(sender == st.owner) throw ERROR_NOT_OWNER;

    val payload = Initialize.fromCell(inMsgBody);
    contract.setCodePostponed(payload.code);
    contract.setData(payload.data);
}
