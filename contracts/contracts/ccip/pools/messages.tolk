// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"
import "../common/types"
import "../rmn_remote/lib"
import "types"

struct (0xdc0b6ff5) TokenPool_ApplyChainUpdates {
    queryId: uint64;
    remoteChainSelectorsToRemove: SnakedCell<uint64>;
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>;
}

struct (0x5fd2c8b6) TokenPool_AddRemotePool {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

struct (0xdbf0a2df) TokenPool_RemoveRemotePool {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

struct (0x4eea060b) TokenPool_SetDynamicConfig {
    queryId: uint64;
    router: address;
    rateLimitAdmin: address? = null;
    feeAdmin: address? = null;
}

struct (0x29b46fc6) TokenPool_SetAllowedFinalityConfig {
    queryId: uint64;
    allowedFinalityConfig: uint32;
}

struct (0x3a028da2) TokenPool_SetRateLimitConfig {
    queryId: uint64;
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>;
}

struct (0x10c4b4a1) TokenPool_ApplyTokenTransferFeeConfigUpdates {
    queryId: uint64;
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>;
    disableChainSelectors: SnakedCell<uint64>;
}

struct (0x7a9c4aa5) TokenPool_UpdateRampAccess {
    queryId: uint64;
    updates: SnakedCell<TokenPool_RampUpdate>;
}

struct (0x823dadf2) TokenPool_UpdateCursedSubjects {
    cursedSubjects: CursedSubjects;
}

/// Lock tokens into the pool or burn the tokens.
/// @param lockOrBurnIn Encoded data fields for the processing of tokens on the source chain.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
/// @param tokenArgs Additional token arguments.
struct (0x1161516e) TokenPool_LockOrBurn {
    queryId: uint64;
    request: Cell<TokenPool_LockOrBurnInV1>; // TODO: consider renaming
    requestedFinalityConfig: uint32;
    tokenArgs: cell?;
    replyTo: address?;
}

struct (0x19e65bea) TokenPool_LockOrBurnResponse {
    queryId: uint64;
    // TODO: unwrap and inline this type
    out: Cell<TokenPool_LockOrBurnOutV1>;
    destTokenAmount: uint256;
}

/// @Releases or mints tokens on the destination chain.
/// @param releaseOrMintIn Encoded data fields for the processing of tokens on the destination chain.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
struct (0x7d0ffd89) TokenPool_ReleaseOrMint {
    queryId: uint64;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    requestedFinalityConfig: uint32;
    replyTo: address? = null;
}

struct (0x7ec43aee) TokenPool_ReleaseOrMintResponse {
    queryId: uint64;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
}

struct (0x41a1702b) TokenPool_ReleaseOrMintFailure {
    queryId: uint64;
    errorCode: uint16;
}

type TokenPool_InMessage =
    | TokenPool_ApplyChainUpdates
    | TokenPool_AddRemotePool
    | TokenPool_RemoveRemotePool
    | TokenPool_SetDynamicConfig
    | TokenPool_SetAllowedFinalityConfig
    | TokenPool_SetRateLimitConfig
    | TokenPool_ApplyTokenTransferFeeConfigUpdates
    | TokenPool_UpdateRampAccess
    | TokenPool_UpdateCursedSubjects
    | TokenPool_LockOrBurn
    | TokenPool_ReleaseOrMint;
