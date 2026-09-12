// SPDX-License-Identifier: MIT
import "../../lib/utils"

const Verifier_FACILITY_NAME = "link.chain.ton.data_streams.Verifier";
const Verifier_FACILITY_ID = Verifier_FACILITY_NAME.crc32() % 640 + 10;  // 600
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

const MAX_NUM_ORACLES: int = 31;

// Bitmap mask for duplicate signer detection. Each of the 31 oracles occupies
// one byte in a 256-bit integer (byte 0 unused). If any byte exceeds 0x01 after
// addition-based accumulation, the signer was counted more than once.
const ORACLE_MASK: int = 0x0001010101010101010101010101010101010101010101010101010101010101;

// Oracle configuration stored per configDigest
struct VerifierConfig {
    f:           uint8;
    isActive:    bool;
    oracleCount: uint8;
    signers:     map<uint160, uint8>;  // ethAddr (20 bytes) → oracle ordinal
}
