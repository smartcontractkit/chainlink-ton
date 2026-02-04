// SPDX-License-Identifier: BUSL-1.1
import "storage"
import "../../../lib/receiver/messages"

type TestReceiver_InMessage = 
    | Receiver_CCIPReceive 
    | TestReceiver_UpdateBehavior
    | TestReceiver_UpdateAuthorizedCaller;

struct (0xcf87a147) TestReceiver_UpdateBehavior {
    behavior: TestReceiverBehavior
}

struct (0x9f5e489f) TestReceiver_UpdateAuthorizedCaller {
    authorizedCaller: address
}
