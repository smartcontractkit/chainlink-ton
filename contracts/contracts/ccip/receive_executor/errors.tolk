enum Error {
    StateIsNotUntouched = 33800; // Facility ID * 100
    UpdatingStateOfNonExecutedMessage;
    NotificationFromInvalidReceiver;
    Unauthorized; //TODO maybe use Ownable2Step or similar
}
