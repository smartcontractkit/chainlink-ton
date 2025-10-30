import "storage"
import "../../../lib/receiver/messages"

type Receiver_InMessage = Receiver_CCIPReceive | Receiver_UpdateBehaviour | Receiver_UpdateAuthorizedCaller;

//crc32('Receiver_UpdateBehaviour')
struct (0x325f16fc) Receiver_UpdateBehaviour {
    behavior: ReceiverBehavior
}

//crc32('Receiver_UpdateAuthorizedCaller')
struct (0xaf9950c5) Receiver_UpdateAuthorizedCaller {
    authorizedCaller: address
}
