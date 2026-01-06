import "types"

enum Error {
    UnknownDestChainSelector = OnRamp_FACILITY_ID * 100
    Unauthorized
    SenderNotAllowed
    InvalidConfig
    UnknownToken
    InsufficientValue
}
