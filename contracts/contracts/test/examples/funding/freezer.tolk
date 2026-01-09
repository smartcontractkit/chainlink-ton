// Small contract to test freezing and unfreezing contracts

struct Storage {
    id: uint32;
    value: uint32;
}

struct (0xed2287f4) SetValue {
    queryID: uint64;
    value: uint32;
}

struct (0xfd475c25) Drain {
}

type InMessages =
    | SetValue
    | Drain;

fun onInternalMessage(in: InMessage) {
    val msg = lazy InMessages.fromSlice(in.body);
    match (msg) {
        SetValue => {
            var st = lazy Storage.fromCell(contract.getData());
            st.value = msg.value;
            contract.setData(st.toCell());
            reply(in.senderAddress).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
        Drain => {
            // send all balance to sender
            reply(in.senderAddress).send(SEND_MODE_CARRY_ALL_BALANCE);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xffff;
        },
    }
}

get fun value() {
    val st = lazy Storage.fromCell(contract.getData());
    return st.value;
}

fun reply(dest: address): OutMessage {
    return createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest,
        body: createEmptyCell(),
    });
}