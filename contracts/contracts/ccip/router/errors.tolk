import "../../lib/utils"

enum Error {
    DestChainNotEnabled = 49600; // Facility ID * 100
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.Router"), local);
}
