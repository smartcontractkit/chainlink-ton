// initialize the contract as a stub with stateInit = {
//   owner: myAddr, type: "OnRamp", id: "some identifier, could also be a complex tuple"
// }

import "deployable/types.tolk";

fun onInternalMessage(in: InMessage) {
    debug.print(1337);
    debug.print(contract.getAddress());
    val st = Deployable<RemainingBitsAndRefs>.load();
    debug.print(1338);
    assert(in.senderAddress == st.owner) throw ERROR_NOT_OWNER;
    debug.print(st.owner);
    val payload = Initialize.fromSlice(in.body);
    debug.print(1339);
    debug.print(payload.stateInit.code.hash());
    contract.setCodePostponed(payload.stateInit.code);
    contract.setData(payload.stateInit.data);
    debug.print(1340);
    //TODO: emit event
}
