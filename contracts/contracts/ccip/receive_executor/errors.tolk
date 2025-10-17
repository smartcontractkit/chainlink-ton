enum Error {
    StateIsNotUntouched = 47900; // Facility ID * 100
    UpdatingStateOfNonExecutedMessage;
    NotificationFromInvalidReceiver;
    NotOwner; //TODO use Ownable2Step or similar
}
