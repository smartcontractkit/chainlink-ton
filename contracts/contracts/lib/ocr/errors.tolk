// getFacilityId(stringCrc32(link.chain.ton.lib.ocr.MultiOCR3Base))
const MultiOCR3Base_FACILITY_ID = 545;
const MultiOCR3Base_ERROR_CODE = MultiOCR3Base_FACILITY_ID * 100

enum MultiOCR3Base_Error {
    BigFMustBePositive = MultiOCR3Base_ERROR_CODE;
    StaticConfigCannotBeChanged
    TooManySigners
    BigFTooHigh
    TooManyTransmitters
    NoTransmitters
    RepeatedSigners
    RepeatedTransmitters
    ConfigDigestMismatch
    UnauthorizedTransmitter
    WrongNumberOfSignatures
    UnauthorizedSigner
    NonUniqueSignatures
    InvalidSignature
    NonExistentOcrPluginType
    NoSigners
}
