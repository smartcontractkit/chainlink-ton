// SPDX-License-Identifier: BUSL-1.1
import "types"

enum Error {
    StateIsNotUntouched = ReceiveExecutor_FACILITY_ID * 100
    UpdatingStateOfNonExecutedMessage
    NotificationFromInvalidReceiver
    Unauthorized
}
