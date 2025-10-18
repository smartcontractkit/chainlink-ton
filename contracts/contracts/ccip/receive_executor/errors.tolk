enum Error {
    StateIsNotUntouched = 47900; // Facility ID * 100
    UpdatingStateOfNonExecutedMessage;
    NotificationFromInvalidReceiver;
    Unauthorized; //TODO maybe use Ownable2Step or similar
}
