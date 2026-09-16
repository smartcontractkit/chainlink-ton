// SPDX-License-Identifier: MIT
import "types"
import "../utils"

const CONTRACT_VERSION = "1.0.0";

fun onInternalMessage(in: InMessage) {
    val st = Deployable<RemainingBitsAndRefs>.load();
    assert(in.senderAddress == st.owner) throw Deployable_Error.NotOwner;
    val inMsg = lazy Deployable_InMessage.fromSlice(in.body);
    match (inMsg) {
        Deployable_Initialize => {
            contract.setCodePostponed(inMsg.stateInit.code);
            contract.setData(inMsg.stateInit.data);
        }
        Deployable_InitializeAndSend => {
            contract.setCodePostponed(inMsg.stateInit.code);
            contract.setData(inMsg.stateInit.data);
            val selfMsg = createMessage({
                bounce: false,
                value: inMsg.selfMessage.value,
                dest: contract.getAddress(),
                body: inMsg.selfMessage.body,
            });
            selfMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
    }
}

get fun typeAndVersion(): (slice, slice) {
    return (Deployable_FACILITY_NAME, CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return Deployable_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode("link.chain.ton.lib.Deployable".crc32(), local);
}
