// SPDX-License-Identifier: BUSL-1.1
const MultiOCR3Base_FACILITY_NAME = "link.chain.ton.lib.ocr.MultiOCR3Base";
const MultiOCR3Base_FACILITY_ID = MultiOCR3Base_FACILITY_NAME.crc32() % 640 + 10;  // 545
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

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
