import "../../lib/utils"

enum Error {
    StateIsNotUntouched = 47900; // Facility ID * 100
    UpdatingStateOfNonExecutedMessage;
    NotificationFromInvalidReceiver;
    NotOwner;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.MerkleRoot"), local);
}
