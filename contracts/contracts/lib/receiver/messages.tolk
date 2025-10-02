import "types"
//crc32('Receiver_CCIPReceive')
struct (0xb3126df1) Receiver_CCIPReceive {
    rootId: uint224; // to calculate where to send CCIPReceiveConfirm and CCIPReceiveFailed
    message: Any2TVMMessage;
}
