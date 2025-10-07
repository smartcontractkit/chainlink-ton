import "../../lib/utils"

enum CCIPSendExecutor_Error {
    StateNotExpected = 43600; // Facility ID * 100
    Unauthorized;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.CCIPSendExecutor"), local);
}
