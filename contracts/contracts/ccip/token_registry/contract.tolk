import "messages"
import "storage"

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenRegistry_InMessage.fromSlice(in.body);

    match (msg) {
        TokenRegistry_GetTokenInfo => {
            onGetTokenInfo(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onGetTokenInfo(msg: TokenRegistry_GetTokenInfo, sender: address) {
    val st = TokenRegistry_Storage.load();
    val response = createMessage({
        dest: sender,
        value: 0,
        bounce: false,
        body: TokenRegistry_TokenPoolInfo {
            tokenInfo: st.info,
        }
    });
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}
