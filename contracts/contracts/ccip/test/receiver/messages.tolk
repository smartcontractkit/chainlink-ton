import "storage"
import "../../../lib/receiver/messages"

type Receiver_InMessage = 
    | Receiver_CCIPReceive 
    | Receiver_UpdateBehavior
    | Receiver_UpdateAuthorizedCaller;

struct (0x14d3fadb) Receiver_UpdateBehavior {
    behavior: ReceiverBehavior
}

struct (0xaf9950c5) Receiver_UpdateAuthorizedCaller {
    authorizedCaller: address
}
