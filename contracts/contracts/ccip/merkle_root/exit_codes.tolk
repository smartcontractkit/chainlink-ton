// TODO: we need to fit additional states: TOKEN_TRANSFER | EXECUTE

enum Error {
    StateIsNotUntouched = 300;
    UpdatingStateOfNonExecutedMessage = 301;
    NotificationFromInvalidReceiver = 303;
    NotOwner = 304 
}

