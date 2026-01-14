import "types"

enum CCIPSendExecutor_Error {
    StateNotExpected = CCIPSendExecutor_FACILITY_ID * 100
    Unauthorized
    InsufficientFunds
    InsufficientFee
    FeeQuoterBounce
}
