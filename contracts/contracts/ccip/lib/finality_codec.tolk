// SPDX-License-Identifier: MIT
// Translated 1:1 from chainlink-ccip chains/evm/contracts/libraries/FinalityCodec.sol

/// @notice This library provides encoding and validation for finality parameters used in cross-chain transfers.
/// @dev this codec supports all the bit flags, even though some might not be assigned any meaning yet. This is
/// intentional to allow for future flexibility.
///
/// @dev Bit layout of the `bytes4` finality value (32 bits, MSB on the left):
///
///  Bit: 31  30  29  28  27  26  25  24  23  22  21  20  19  18  17  16 | 15  14  13  12  11  10   9   8   7   6   5   4   3   2   1   0
///      +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
///      | R | R | R | R | R | R | R | R | R | R | R | R | R | R | R | S |                          block depth (16 bits)                |
///      +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
///      \_______________________________  _____________________________/ \______________________________  _____________________________/
///                                      \/                                                              \/
///                                 flags (16 bits)                                                  depth (16 bits)
///                                                                                                max = 65535 (0xFFFF)
///
///  S  (bit 16) = WAIT_FOR_SAFE_FLAG  — wait for the `safe` tag.
///  R  (bits 17-31) = Reserved for future flags (currently unassigned; accepted on the wire).
///                    Reserved bits may be assigned in the future, read the docs for the latest bit definitions.
///
///  Special values:
///    0x00000000  WAIT_FOR_FINALITY_FLAG  — wait for full finality (safest, default).
///    0x00010000  WAIT_FOR_SAFE_FLAG      — wait for the `safe` head (bit 16 set, no depth).
///    0x00000001..0x0000FFFF              — wait for N blocks.

const FinalityCodec_FACILITY_NAME = "link.chain.ton.ccip.lib.FinalityCodec";
const FinalityCodec_FACILITY_ID = FinalityCodec_FACILITY_NAME.crc32() % 640 + 10; // 503
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

enum FinalityCodec_Error {
    InvalidRequestedFinality = FinalityCodec_FACILITY_ID * 100 // (bytes4 requestedFinality, bytes4 allowedFinality);
    RequestedFinalityCanOnlyHaveOneMode // (bytes4 encodedFinality);
}

/// Error args for `InvalidRequestedFinality`
struct FinalityCodec_Error_InvalidRequestedFinality {
    requestedFinality: uint32;
    allowedFinality: uint32;
}

/// Error args for `RequestedFinalityCanOnlyHaveOneMode`
struct FinalityCodec_Error_RequestedFinalityCanOnlyHaveOneMode {
    encodedFinality: uint32;
}

/// @notice The block depth is stored in the lower 16 bits, leaving the upper 16 bits for flags.
/// For more security, users should wait for finality instead (bytes4(0)).
const FinalityCodec_BLOCK_DEPTH_BITS: uint32 = 16;
/// @notice The maximum block depth that can be encoded in the finality params.
const FinalityCodec_MAX_BLOCK_DEPTH: uint32 = 0xFFFF;
/// @notice The block depth mask to extract the block depth from the finality params.
const FinalityCodec_BLOCK_DEPTH_MASK: uint32 = FinalityCodec_MAX_BLOCK_DEPTH;

/// @notice The finality flag for waiting for finality is 0, this is the safest option. Any block depth that's deeper
/// than finality will fall back to finality, meaning a very deep block depth will not be more secure than finality.
const FinalityCodec_WAIT_FOR_FINALITY_FLAG: uint32 = 0;
/// @notice Signals to wait for the `safe` tag.
const FinalityCodec_WAIT_FOR_SAFE_FLAG: uint32 = 1 << FinalityCodec_BLOCK_DEPTH_BITS;

/// @notice Helper to encode block depth into the finality params. Returns WAIT_FOR_FINALITY_FLAG if the block depth
/// is zero.
/// @param blockDepth The block depth to encode into the finality params.
/// @return The encoded finality params with the block depth.
fun FinalityCodec_encodeBlockDepth(blockDepth: uint16): uint32 {
    return blockDepth as uint32;
}

/// @notice Helper to encode the `safe` tag plus a block depth into the finality params.
/// NOTE: this format is only allowed for allowed finality, not requested finality, as requested finality can only
/// contain a single flag or block depth, but allowed finality can contain multiple.
/// @param blockDepth The block depth to encode into the finality params.
/// @return The encoded finality params with the `safe` tag and block depth.
fun FinalityCodec_encodeBlockDepthAndSafeFlag(blockDepth: uint16): uint32 {
    return FinalityCodec_encodeBlockDepth(blockDepth) | FinalityCodec_WAIT_FOR_SAFE_FLAG;
}

/// @notice Validates requested finality: either `bytes4(0)`, exactly one set bit among the upper flag bits, or a pure
/// block depth (no flag bits, depth in `1..MAX_BLOCK_DEPTH`). Never a flag combined with a non-zero depth. Unknown
/// flags are accepted here for wire compatibility; pools/CCVs reject modes they do not implement.
/// @param encodedFinality The encoded finality params to validate.
fun FinalityCodec_validateRequestedFinality(encodedFinality: uint32) {
    // Waiting for finality is always valid.
    if (encodedFinality == FinalityCodec_WAIT_FOR_FINALITY_FLAG) {
        return;
    }
    val hasBlockDepth = (encodedFinality & FinalityCodec_BLOCK_DEPTH_MASK) != 0;
    var activeModes = hasBlockDepth ? 1 : 0; // If it has depth, it counts as one active mode.

    val flags = encodedFinality >> FinalityCodec_BLOCK_DEPTH_BITS;
    if (flags != 0) {
        var i = 0;
        while (i < 16) {
            if ((flags & (1 << i)) != 0) {
                activeModes += 1;
            }
            i += 1;
        }
    }
    // There must be exactly one active mode: either a block depth or a single flag. Selecting multiple modes is only
    // allowed for `allowedFinality` set by Pools, CCVs, etc., but not for `requestedFinality` set by senders.
    if (activeModes != 1) {
        throw (FinalityCodec_Error.RequestedFinalityCanOnlyHaveOneMode, FinalityCodec_Error_RequestedFinalityCanOnlyHaveOneMode {
            encodedFinality,
        });
    }
}

/// @notice Validates that `requestedFinality` is well-formed and permitted by `allowedFinality`.
/// @param requestedFinality The requested finality params to check.
/// @param allowedFinality The allowed finality params to check against.
fun FinalityCodec_ensureRequestedFinalityAllowed(requestedFinality: uint32, allowedFinality: uint32) {
    // Finality is always allowed.
    if (requestedFinality == FinalityCodec_WAIT_FOR_FINALITY_FLAG) {
        return;
    }

    // Validate the structural shape of the requested finality, as it is only allowed to signal one mode.
    FinalityCodec_validateRequestedFinality(requestedFinality);

    // If any of the flags match, the request is allowed only when it has no depth field (flag-only request).
    if (((requestedFinality >> FinalityCodec_BLOCK_DEPTH_BITS) & (allowedFinality >> FinalityCodec_BLOCK_DEPTH_BITS)) != 0) {
        return;
    }
    // Otherwise, it must be block-depth based.
    val requestedBlockDepth = requestedFinality & FinalityCodec_BLOCK_DEPTH_MASK;
    val allowedBlockDepth = allowedFinality & FinalityCodec_BLOCK_DEPTH_MASK;
    if (allowedBlockDepth == 0 || requestedBlockDepth < allowedBlockDepth) {
        throw (FinalityCodec_Error.InvalidRequestedFinality, FinalityCodec_Error_InvalidRequestedFinality {
            requestedFinality,
            allowedFinality,
        });
    }
}
