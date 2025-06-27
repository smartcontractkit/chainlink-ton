// initialize the contract as a stub with stateInit = {
//   owner: myAddr, type: "OnRamp", id: "some identifier, could also be a complex tuple"
// }

import "deployable/types.tolk";
import "lib/utils.tolk";

fun onInternalMessage(msgCell: cell, inMsgBody: slice) {
    var cs: slice = msgCell.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    val st = Deployable<RemainingBitsAndRefs>.load();
    val sender: address = cs.loadAddress();
    assert(sender == st.owner) throw ERROR_NOT_OWNER;

    val payload = Initialize.fromSlice(inMsgBody);
    contract.setCodePostponed(payload.stateInit.code);
    contract.setData(payload.stateInit.data);
}
