// SPDX-License-Identifier: BUSL-1.1
import "../../lib/jetton/messages"
import "../../lib/utils"
import "../common/types"
import "../rmn_remote/lib"

import "types"

struct (0x56f73d37) TokenPool_ApplyChainUpdates {
    queryId: uint64;
    remoteChainSelectorsToRemove: SnakedCell<uint64>;
    chainsToAdd: SnakedCell<TokenPool_ChainUpdate>;
}

struct (0x17c242dc) TokenPool_AddRemotePool {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

/// Used as a reply message for `TokenPool_AddRemotePool` to confirm and return excess to sender.
struct (0x17c242d3) TokenPool_RemotePoolAddedNotification {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

struct (0x426b8cc4) TokenPool_RemoveRemotePool {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

/// Used as a reply message for `TokenPool_RemoveRemotePool` to confirm and return excess to sender.
struct (0x17c242d1) TokenPool_RemotePoolRemovedNotification {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

struct (0xd7712810) TokenPool_SetDynamicConfig {
    queryId: uint64;
    router: address;
    rateLimitAdmin: address? = null;
    feeAdmin: address? = null;
}

struct (0x3c50a39b) TokenPool_SetAllowedFinalityConfig {
    queryId: uint64;
    allowedFinalityConfig: uint32;
}

struct (0x4fe2d26c) TokenPool_SetRateLimitConfig {
    queryId: uint64;
    updates: SnakedCell<TokenPool_RateLimitConfigArgs>;
}

struct (0x30a1d1f7) TokenPool_ApplyTokenTransferFeeConfigUpdates {
    queryId: uint64;
    updates: SnakedCell<TokenPool_TokenTransferFeeConfigArgs>;
    disableChainSelectors: SnakedCell<uint64>;
}

struct (0xe30764be) TokenPool_UpdateRampAccess {
    queryId: uint64;
    updates: SnakedCell<TokenPool_RampUpdate>;
}

/// Sets the RMN proxy address, a role which is responsible for updating the cursed subjects list.
struct (0x9929b642) TokenPool_SetRMNProxy {
    queryId: uint64;
    rmnProxy: address;
}

struct (0x2c906eb7) TokenPool_UpdateCursedSubjects {
    queryId: uint64;
    cursedSubjects: CursedSubjects;
}

/// Lock tokens into the pool or burn the tokens.
/// @param lockOrBurnIn Encoded data fields for the processing of tokens on the source chain.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
/// @param tokenArgs Additional token arguments.
struct (0xfa7da444) TokenPool_LockOrBurn {
    queryId: uint64;
    request: Cell<TokenPool_LockOrBurnInV1>; // TODO: consider renaming
    requestedFinalityConfig: uint32;
    tokenArgs: cell?;
    replyTo: address?;
}

struct TokenPool_LockOrBurnForwardPayload {
    requestMsg: Cell<TokenPool_LockOrBurn>,
    prepared: Cell<TokenPool_LockOrBurnPrepared>,
}

/// @Releases or mints tokens on the destination chain.
/// @param releaseOrMintIn Encoded data fields for the processing of tokens on the destination chain.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
struct (0x351f77e3) TokenPool_ReleaseOrMint {
    queryId: uint64;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    requestedFinalityConfig: uint32;
    replyTo: address? = null;
}

/// Sent by advanced hooks contract to notify preflight check success
struct (0xfa7da440) TokenPool_PreflightCheckFinished {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

/// Sent by advanced hooks contract to notify preflight check failure
struct (0xfa7da441) TokenPool_PreflightCheckFailed {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

/// Sent by advanced hooks contract to notify postflight check success
struct (0xfa7da442) TokenPool_PostflightCheckFinished {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

/// Sent by advanced hooks contract to notify postflight check failure
struct (0xfa7da443) TokenPool_PostflightCheckFailed {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

type TokenPool_InMessage =
    | TokenPool_LockOrBurn
    | TransferNotificationForRecipient // fwdPayload = TokenPool_LockOrBurnForwardPayload
    | TokenPool_PreflightCheckFinished
    | TokenPool_PreflightCheckFailed
    | TokenPool_ReleaseOrMint
    | TokenPool_PostflightCheckFinished
    | TokenPool_PostflightCheckFailed
    | TokenPool_ApplyChainUpdates
    | TokenPool_AddRemotePool
    | TokenPool_RemoveRemotePool
    | TokenPool_SetDynamicConfig
    | TokenPool_SetAllowedFinalityConfig
    | TokenPool_SetRateLimitConfig
    | TokenPool_ApplyTokenTransferFeeConfigUpdates
    | TokenPool_UpdateRampAccess
    | TokenPool_SetRMNProxy
    | TokenPool_UpdateCursedSubjects;

struct (0xfa7da444) TokenPool_LockOrBurnWithdraw {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

struct (0x6c060424) TokenPool_LockOrBurnFinished {
    queryId: uint64;
    // TODO: unwrap and inline this type
    out: Cell<TokenPool_LockOrBurnOutV1>;
    destTokenAmount: uint256;
}

struct (0xef0cb360) TokenPool_LockOrBurnFailure {
    queryId: uint64;
    errorCode: uint16;
}

struct (0x78dc2232) TokenPool_ReleaseOrMintFinished {
    queryId: uint64;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
}

struct (0xef0cb361) TokenPool_ReleaseOrMintFailure {
    queryId: uint64;
    errorCode: uint16;
}

type TokenPool_OutMessage = 
    | TokenPool_LockOrBurnWithdraw
    | TokenPool_LockOrBurnFinished
    | TokenPool_LockOrBurnFailure
    | TokenPool_ReleaseOrMintFinished
    | TokenPool_ReleaseOrMintFailure
    | TokenPool_RemotePoolAddedNotification
    | TokenPool_RemotePoolRemovedNotification;
    // TODO: add more outgoing reply messages
