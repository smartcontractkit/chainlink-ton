import "types"

// initialize the contract as a stub with stateInit = {
//   owner: myAddr, type: "OnRamp", id: "some identifier, could also be a complex tuple"
// }

fun onInternalMessage(in: InMessage) {
    val st = Deployable<RemainingBitsAndRefs>.load();
    assert(in.senderAddress == st.owner) throw ERROR_NOT_OWNER;

    val payload = Deployable_Initialize.fromSlice(in.body);

    contract.setCodePostponed(payload.stateInit.code);
    contract.setData(payload.stateInit.data);
    //TODO: emit event
}
