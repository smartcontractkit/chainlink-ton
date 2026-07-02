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

struct (0x426b8cc4) TokenPool_RemoveRemotePool {
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

struct (0x3f5c9f57) TokenPool_SetAdvancedPoolHooks {
    queryId: uint64;
    advancedPoolHooks: address?;
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

struct (0x9da4da09) TokenPool_SetCursedSubjects {
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
    originalSender: address,
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

/// Sent by advanced hooks contract (via bounce or direct reply) to notify preflight check success.
struct (0x08f2ffb7) TokenPool_PreflightCheckFinished {
    queryId: uint64;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

/// Sent by advanced hooks contract (via bounce or direct reply) to notify preflight check failure.
struct (0xa6dfa623) TokenPool_PreflightCheckFailed {
    queryId: uint64;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
}

/// Forward payload for ReleaseOrMint operations used during async postflight checks.
struct TokenPool_ReleaseOrMintForwardPayload {
    originalSender: address,
    requestMsg: Cell<TokenPool_ReleaseOrMint>,
    prepared: Cell<TokenPool_ReleaseOrMintPrepared>,
}

/// Sent by advanced hooks contract to notify postflight check success
struct (0x9e2a6b66) TokenPool_PostflightCheckFinished {
    queryId: uint64;
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

/// Sent by advanced hooks contract to notify postflight check failure
struct (0x21e71d87) TokenPool_PostflightCheckFailed {
    queryId: uint64;
    forwardPayload: Cell<TokenPool_ReleaseOrMintForwardPayload>;
}

/// Sent from TokenPool to AdvancedPoolHooks to request an async preflight check.
struct (0x4129d109) TokenPool_PreflightCheck {
    queryId: uint64;
    request: Cell<TokenPool_LockOrBurnInV1>;
    requestedFinalityConfig: uint32;
    tokenArgs: cell?;
    amountPostFee: uint256;
    replyTo: address;
    replyPayload: cell?;
}

/// Sent from TokenPool to AdvancedPoolHooks to request an async postflight check.
struct (0x703c2b58) TokenPool_PostflightCheck {
    queryId: uint64;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    localAmount: uint256;
    requestedFinalityConfig: uint32;
    replyTo: address;
    replyPayload: cell?;
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
    | TokenPool_SetAdvancedPoolHooks
    | TokenPool_SetRateLimitConfig
    | TokenPool_ApplyTokenTransferFeeConfigUpdates
    | TokenPool_UpdateRampAccess
    | TokenPool_SetRMNProxy
    | TokenPool_SetCursedSubjects;

struct (0xe7a35041) TokenPool_LockOrBurnWithdraw {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

struct (0xf432a4e3) TokenPool_LockOrBurnFinished {
    queryId: uint64;
    // TODO: unwrap and inline this type
    out: Cell<TokenPool_LockOrBurnOutV1>;
    destTokenAmount: uint256;
}

struct (0x3476ea72) TokenPool_LockOrBurnFailure {
    queryId: uint64;
    errorCode: uint16;
}

struct (0xe0e882f5) TokenPool_ReleaseOrMintFinished {
    queryId: uint64;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
}

struct (0xef0cb36e) TokenPool_ReleaseOrMintFailure {
    queryId: uint64;
    errorCode: uint16;
}

/// Replied on `TokenPool_AddRemotePool` to confirm tx and return excess to sender.
struct (0x12cc4985) TokenPool_RemotePoolAddedNotification {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

/// Replied on `TokenPool_RemoveRemotePool` to confirm tx and return excess to sender.
struct (0xe17bf3cc) TokenPool_RemotePoolRemovedNotification {
    queryId: uint64;
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

struct (0x426a713b) TokenPool_FinalityConfigSet {
    queryId: uint64;
    allowedFinalityConfig: uint32;
}

/// Replied on `TokenPool_SetDynamicConfig` to confirm tx and return excess to sender.
struct (0xb735e30c) TokenPool_DynamicConfigSet {
    queryId: uint64;
    router: address;
    rateLimitAdmin: address?;
    feeAdmin: address?;
}

/// Replied on `TokenPool_SetRateLimitConfig` to confirm tx and return excess to sender.
struct (0xdd7b0c71) TokenPool_RateLimitConfiguredNotification {
    queryId: uint64;
}

/// Replied on `TokenPool_SetRMNProxy` to confirm tx and return excess to sender.
struct (0xe5d08b2e) TokenPool_RMNProxySet {
    queryId: uint64;
    rmnProxy: address;
}

/// Replied on `TokenPool_SetCursedSubjects` to confirm tx and return excess to sender.
struct (0x15800161) TokenPool_CursedSubjectsSet {
    queryId: uint64;
    cursedSubjects: CursedSubjects;
}

/// Replied on `TokenPool_ApplyChainUpdates` to confirm tx and return excess to sender.
struct (0xad7833d7) TokenPool_ChainUpdatesApplied {
    queryId: uint64;
}

/// Replied on `TokenPool_UpdateRampAccess` to confirm tx and return excess to sender.
struct (0xd7f5c563) TokenPool_RampAccessUpdatesApplied {
    queryId: uint64;
}

/// Replied on `TokenPool_ApplyTokenTransferFeeConfigUpdates` to confirm tx and return excess to sender.
struct (0x28cbcc64) TokenPool_FeeConfigApplied {
    queryId: uint64;
}

struct (0x3c869d80) TokenPool_AdvancedPoolHooksSet {
    queryId: uint64;
    advancedPoolHooks: address?;
}

type TokenPool_OutMessage = 
    | TokenPool_LockOrBurnWithdraw
    | TokenPool_LockOrBurnFinished
    | TokenPool_LockOrBurnFailure
    | TokenPool_ReleaseOrMintFinished
    | TokenPool_ReleaseOrMintFailure
    | TokenPool_RemotePoolAddedNotification
    | TokenPool_RemotePoolRemovedNotification
    | TokenPool_FinalityConfigSet
    | TokenPool_DynamicConfigSet
    | TokenPool_RateLimitConfiguredNotification
    | TokenPool_CursedSubjectsSet
    | TokenPool_AdvancedPoolHooksSet
    | TokenPool_ChainUpdatesApplied
    | TokenPool_RampAccessUpdatesApplied
    | TokenPool_FeeConfigApplied;
