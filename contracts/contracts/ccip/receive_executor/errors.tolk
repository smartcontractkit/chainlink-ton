import "types"

enum Error {
    StateIsNotUntouched = ReceiveExecutor_FACILITY_ID * 100
    UpdatingStateOfNonExecutedMessage
    NotificationFromInvalidReceiver
    Unauthorized
}
