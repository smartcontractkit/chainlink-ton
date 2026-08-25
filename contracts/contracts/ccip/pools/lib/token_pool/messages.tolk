// SPDX-License-Identifier: BUSL-1.1
import "../../../../lib/jetton/messages"
import "../../../../lib/funding/jetton_withdrawable"
import "../../../../lib/utils"

import "../../../common/types"
import "../../../rmn_remote/lib"

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

/// Sets the compiled Deployable code used to derive source-chain deposit accounts.
/// @dev Owner-only (admin config). See `TokenPool_AdminConfig.deployableCode`.
struct (0x3868e309) TokenPool_SetDeployableCode {
    queryId: uint64;
    deployableCode: cell?;
}

/// Replied on `TokenPool_SetDeployableCode` to confirm tx and return excess to sender.
struct (0x89d602e5) TokenPool_DeployableCodeSet {
    queryId: uint64;
    deployableCode: cell?;
}

/// Sets the Deployables namespaces whose deposit-account contracts the pool will accept.
/// @dev Owner-only (dynamic config). Each entry must be a namespace for which
///      `TokenPool_AdminConfig.deployableCode` is registered. Replaces any previous set.
struct (0x84384142) TokenPool_SetAllowedDepositNamespaces {
    queryId: uint64;
    allowedDepositNamespaces: map<uint32, bool>;
}

/// Replied on `TokenPool_SetAllowedDepositNamespaces` to confirm tx and return excess to sender.
struct (0xc1ffe3a6) TokenPool_AllowedDepositNamespacesSet {
    queryId: uint64;
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

/// Sets the RMN proxy address, a role which is responsible for updating the cursed subjects list.
struct (0x9929b642) TokenPool_SetRMNProxy {
    queryId: uint64;
    rmnProxy: address?;
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
    amountPostFee: coins;
    replyTo: address;
    replyPayload: cell?;
}

/// Sent from TokenPool to AdvancedPoolHooks to request an async postflight check.
struct (0x703c2b58) TokenPool_PostflightCheck {
    queryId: uint64;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    localAmount: coins;
    requestedFinalityConfig: uint32;
    replyTo: address;
    replyPayload: cell?;
}

/// Optional fee parameters computed by the pool for a `TokenPool_GetCCVsAndFees` request
/// (mirroring EVM `getFee` + the outbound fee-subtraction). `feesProvided=false` means the
/// fields are meaningless and callers must fall back to FeeQuoter defaults (isEnabled=false).
struct TokenPool_FeeContext {
    feeConfig: TokenPool_TokenTransferFeeConfig;
    amountPostFee: coins;
    feesProvided: bool;
}

/// Requests the pool's required CCVs for a transfer (no fees). The pool replies with
/// `TokenPool_CCVs`. This same message is also used for the pool→hooks hop (`replyTo` = pool,
/// `forwardPayload` carries the pool's context) in BOTH the CCVs and CCVsAndFees flows, so the
/// hooks only ever need to handle this one message.
/// @dev The pool replies to the request sender. `forwardPayload` is per-request context echoed
///      back in the reply (and failure) so the caller can resume its flow.
struct (0xc5476d2b) TokenPool_GetCCVs {
    queryId: uint64;
    localToken: address;                            // The pool's local token.
    remoteChainSelector: uint64;                    // The remote lane for this transfer.
    amount: coins;                                  // Source-denominated amount (post-fee/local on the hooks hop).
    requestedFinalityConfig: uint32;                // Finality encoding (see `FinalityCodec`).
    direction: uint8;                               // TokenPool_MessageDirection (0 outbound, 1 inbound).
    extraData: cell?;                               // tokenArgs outbound, sourcePoolData inbound.
    replyTo: address;                               // Hooks reply destination on the pool→hooks hop (the pool).
    forwardPayload: cell?;                          // Caller context; pool→hooks: Cell<TokenPool_GetCCVsContext>.
}

/// Requests the pool's required CCVs AND applicable token-transfer fee parameters for a transfer.
/// Same query inputs as `TokenPool_GetCCVs`; the pool additionally computes the fees
/// (`TokenPool_FeeContext`) and replies with `TokenPool_CCVsAndFees`.
/// TON-native, asynchronous replacement for EVM `getRequiredCCVs` + `getFee`.
struct (0xd22944d5) TokenPool_GetCCVsAndFees {
    queryId: uint64;
    localToken: address;                            // The pool's local token.
    remoteChainSelector: uint64;                    // The remote lane for this transfer.
    amount: coins;                                  // Source-denominated amount.
    requestedFinalityConfig: uint32;                // Finality encoding (see `FinalityCodec`).
    direction: uint8;                               // TokenPool_MessageDirection (0 outbound, 1 inbound).
    extraData: cell?;                               // tokenArgs outbound, sourcePoolData inbound.
    forwardPayload: cell?;                          // Per-request context echoed back in the reply.
}

/// Reply from the pool to a `TokenPool_GetCCVs` request, carrying only the required CCVs.
/// `fwdPayload` echoes the caller's per-request context.
struct (0x6c70b2dd) TokenPool_CCVs {
    queryId: uint64;
    requiredCCVs: SnakedCell<address>;              // Empty = use lane defaults.
    fwdPayload: cell?;
}

/// Reply from the pool to a `TokenPool_GetCCVsAndFees` request, carrying the required CCVs plus
/// the pool-computed fee params (`TokenPool_FeeContext`). `fwdPayload` echoes the caller's
/// per-request context.
struct (0x158dd7d5) TokenPool_CCVsAndFees {
    queryId: uint64;
    requiredCCVs: SnakedCell<address>;              // Empty = use lane defaults.
    fees: Cell<TokenPool_FeeContext>;
    fwdPayload: cell?;
}

/// Failure reply when a `TokenPool_GetCCVs`/`TokenPool_GetCCVsAndFees` cannot complete (e.g. the
/// hooks contract bounced). Finalizes the query so the caller can abort/resume using `fwdPayload`.
struct (0x0449d467) TokenPool_GetCCVsFailed {
    queryId: uint64;
    errorCode: uint16;
    fwdPayload: cell?;
}

/// Context the pool captures from a `TokenPool_GetCCVs`/`TokenPool_GetCCVsAndFees` and echoes
/// through the hooks hop so it can reassemble the final reply on the callback. `fees` is set only
/// for the `AndFees` flow (computed eagerly in `onGetCCVsAndFees`) and selects the reply variant.
struct TokenPool_GetCCVsContext {
    replyTo: address;
    fwdPayload: cell?;
    fees: cell?;                                    // Cell<TokenPool_FeeContext>; null for CCVs-only.
}

/// Reply from AdvancedPoolHooks carrying the required CCV set for a `TokenPool_GetCCVs`
/// forwarded by the pool. An empty `requiredCCVs` list signals "use the lane defaults".
struct (0x30612b17) TokenPool_QueryCCVsReply {
    queryId: uint64;
    requiredCCVs: SnakedCell<address>;
    replyPayload: cell?;                            // Cell<TokenPool_GetCCVsContext> echoed back.
}

type TokenPool_InMessage =
    | TokenPool_LockOrBurn
    | TransferNotificationForRecipient // fwdPayload = TokenPool_LockOrBurnForwardPayload
    | TokenPool_PreflightCheckFinished
    | TokenPool_PreflightCheckFailed
    | TokenPool_ReleaseOrMint
    | TokenPool_PostflightCheckFinished
    | TokenPool_PostflightCheckFailed
    | TokenPool_GetCCVs
    | TokenPool_GetCCVsAndFees
    | TokenPool_QueryCCVsReply
    | TokenPool_ApplyChainUpdates
    | TokenPool_AddRemotePool
    | TokenPool_RemoveRemotePool
    | TokenPool_SetDynamicConfig
    | TokenPool_SetAllowedFinalityConfig
    | TokenPool_SetAdvancedPoolHooks
    | TokenPool_SetDeployableCode
    | TokenPool_SetAllowedDepositNamespaces
    | TokenPool_SetRateLimitConfig
    | TokenPool_ApplyTokenTransferFeeConfigUpdates
    | TokenPool_SetRMNProxy
    | TokenPool_SetCursedSubjects
    | JettonWithdrawable_Withdraw;

struct (0xe7a35041) TokenPool_LockOrBurnWithdraw {
    queryId: uint64;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

struct (0xf432a4e3) TokenPool_LockOrBurnFinished {
    queryId: uint64;
    // TODO: unwrap and inline this type
    out: Cell<TokenPool_LockOrBurnOutV1>;
    /// Token amount in local token decimals after deducting the fee.
    // TBD: rename to just amount?
    destTokenAmount: coins;
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
    rmnProxy: address?;
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
    | TokenPool_CCVs
    | TokenPool_CCVsAndFees
    | TokenPool_GetCCVsFailed
    // The same GetCCVs struct is reused for the pool→hooks hop.
    | TokenPool_GetCCVs
    | TokenPool_RemotePoolAddedNotification
    | TokenPool_RemotePoolRemovedNotification
    | TokenPool_FinalityConfigSet
    | TokenPool_DynamicConfigSet
    | TokenPool_DeployableCodeSet
    | TokenPool_AllowedDepositNamespacesSet
    | TokenPool_RateLimitConfiguredNotification
    | TokenPool_CursedSubjectsSet
    | TokenPool_AdvancedPoolHooksSet
    | TokenPool_ChainUpdatesApplied
    | TokenPool_FeeConfigApplied;
