// TODO: we need to fit additional states: TOKEN_TRANSFER | EXECUTE

enum Error {
    StateIsNotUntouched;
    UpdatingStateOfNonExecutedMessage;
    NotificationFromInvalidReceiver;
    NotOwner;
}
