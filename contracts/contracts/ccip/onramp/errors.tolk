import "../../lib/utils"

enum Error {
    UnknownDestChainSelector = 18100; // Facility ID * 100
    Unauthorized;
    SenderNotAllowed;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.OnRamp"), local);
}


