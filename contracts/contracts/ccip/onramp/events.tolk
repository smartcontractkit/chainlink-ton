import "types"

const CCIP_MESSAGE_SENT_TOPIC: int = stringCrc32("CCIPMessageSent"); 

struct CCIPMessageSent {
    message: TVM2AnyRampMessage;
}
