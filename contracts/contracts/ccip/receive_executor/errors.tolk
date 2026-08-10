// SPDX-License-Identifier: BUSL-1.1
import "types"

enum ReceiveExecutor_Error {
    UpdatingStateOfNonExecutedMessage = ReceiveExecutor_FACILITY_ID * 100
    NotificationFromInvalidReceiver
    Unauthorized
}
