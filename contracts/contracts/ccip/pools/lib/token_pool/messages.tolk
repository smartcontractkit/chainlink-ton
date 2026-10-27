// SPDX-License-Identifier: BUSL-1.1

import "../../../../lib/utils"
import "../../../../lib/access/access_control"
import "../../../../lib/jetton/messages"
import "../../../../lib/funding/jetton_withdrawable"

import "../../../common/types"
import "../../../rmn_remote/lib"

import "types"
import "budget"

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

/// Curses the given subjects in the pool-local curse policy. Sender must hold `CURSE_ROLE`.
struct (0xfdd0edc0) TokenPool_Curse {
    queryId: uint64;
    subjects: SnakedCell<uint128>;
}

/// Uncurses the given subjects in the pool-local curse policy. Sender must hold `UNCURSE_ROLE`.
struct (0x61cf16f1) TokenPool_Uncurse {
    queryId: uint64;
    subjects: SnakedCell<uint128>;
}

/// Wraps the standard `Ownable2Step` messages so transfers of the curse
/// administrator do not collide with transfers of pool ownership.
struct (0x72b535a5) TokenPool_RMNOwnableMessage {
    content: RemainingBitsAndRefs; // Ownable2Step_Messages
}

/// Wraps the standard `AccessControl` messages so RBAC changes on the
/// pool-local curse policy do not collide with the pool's own top-level
/// messages.
struct (0x2e7a1790) TokenPool_RMNAccessControlMessage {
    content: Cell<AccessControl_InMessage>;
}

/// Lock tokens into the pool or burn the tokens.
/// @param lockOrBurnIn Encoded data fields for the processing of tokens on the source chain.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
/// @param tokenArgs Additional token arguments.
/// @param onRampNamespaces The Router's accepted deposit-account namespaces, relayed on every
///        request so the pool can refresh its deposit-auth cache.
struct (0xfa7da444) TokenPool_LockOrBurn {
    queryId: uint64;
    request: Cell<TokenPool_LockOrBurnInV1>; // TODO: consider renaming
    requestedFinalityConfig: uint32;
    tokenArgs: cell?;

    // Continuation info

    replyTo: address;

    /// A: admission budget. Checked at the entrypoint; covers pre-custody processing, the
    /// withdraw relay, and two custody phases (`A >= 3S`).
    /// S: safety budget for one custody phase. Covers the return and success/failure finalization.
    /// F: finalization/continuation supplied by the caller.
    ///
    /// The entry checks `msgValue >= A + F`. The custody transfer carries `2S + F`; the last
    /// custody hop (burn or lockbox deposit) and its finalization are funded from that forward.

    /// Finalization value the caller asks the lock/burn flow to forward on success/failure.
    finalizationValue: coins;
    onRampNamespaces: map<uint32, ()> = [];

    /// Where jetton wallets return unused TON (success excess). The caller chooses it; the
    /// source flow defaults to the transfer's original sender.
    sendExcessesTo: address? = null;
}

struct TokenPool_LockOrBurnForwardPayload {
    originalSender: address,
    requestMsg: Cell<TokenPool_LockOrBurn>,
    prepared: Cell<TokenPool_LockOrBurnPrepared>,
}

/// @Releases or mints tokens on the destination chain.
/// @param releaseOrMintIn Encoded data fields for the processing of tokens on the destination chain.
/// @param requestedFinalityConfig Requested finality encoding (see `FinalityCodec`).
/// @param delivery Where the Router wants the released/minted tokens sent.
struct (0x351f77e3) TokenPool_ReleaseOrMint {
    queryId: uint64;
    request: Cell<TokenPool_ReleaseOrMintInV1>;
    requestedFinalityConfig: uint32;

    // Continuation info
    replyTo: address;
    delivery: Cell<TokenPool_ReleaseOrMintDelivery>;

    /// Where jetton wallets return unused TON (success excess). The caller chooses it; the
    /// destination flow defaults to the request sender.
    sendExcessesTo: address? = null;
}

/// Finalization value the caller asks the release/mint delivery to forward (zero without delivery).
fun TokenPool_ReleaseOrMint.finalizationValue(self): coins {
    return self.delivery.load().forwardTonAmount;
}

/// Jetton transfer the pool performs to deliver released/minted tokens.
/// @dev The pool sends `forwardPayload` wrapped in a `Jetton_ForwardPayloadWrap` carrying its own
///      context, which it reads back if the transfer fails.
struct TokenPool_ReleaseOrMintDelivery {
    /// Owner of the destination jetton wallet.
    recipient: address;
    forwardTonAmount: coins;
    forwardPayload: cell?;
}

/// Sent by the Router once the ReceiveExecutor confirmed the released/minted tokens reached the
/// receiver's deposit account. The pool answers `replyTo` (the ReceiveExecutor) with
/// `TokenPool_ReleaseOrMintFinalized`.
struct (0x81d45b24) TokenPool_ReleaseOrMintDelivered {
    queryId: uint64;
    replyTo: address;
    transfer: Cell<TokenPool_DeliveredTransfer>;
}

struct TokenPool_DeliveredTransfer {
    remoteChainSelector: uint64;
    localToken: address;
    receiver: address;
    amount: coins;
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
    direction: TokenPool_MessageDirection;          // 0 outbound, 1 inbound.
    extraData: cell?;                               // tokenArgs outbound, sourcePoolData inbound.
    replyTo: address;                               // Hooks reply destination on the pool→hooks hop (the pool).
    forwardPayload: cell?;                          // Caller context; pool→hooks: Cell<TokenPool_GetCCVsContext>.
}

/// Same query inputs as `TokenPool_GetCCVs` (see there for field semantics); the pool
/// additionally computes the fees (`TokenPool_FeeContext`) and replies with `TokenPool_CCVsAndFees`.
/// TON-native, asynchronous replacement for EVM `getRequiredCCVs` + `getFee`.
struct (0xd22944d5) TokenPool_GetCCVsAndFees {
    queryId: uint64;
    localToken: address;
    remoteChainSelector: uint64;
    amount: coins;
    requestedFinalityConfig: uint32;
    direction: TokenPool_MessageDirection;
    extraData: cell?;
    forwardPayload: cell?;                          // Per-request context echoed back in the reply.
}

/// Reply to `TokenPool_GetCCVs`: required CCVs only; `fwdPayload` echoes the caller's context.
struct (0x6c70b2dd) TokenPool_CCVs {
    queryId: uint64;
    requiredCCVs: array<address>;                   // Max 255; empty = use lane defaults.
    fwdPayload: cell?;
}

/// Reply to `TokenPool_GetCCVsAndFees`: required CCVs plus pool-computed `fees`.
struct (0x158dd7d5) TokenPool_CCVsAndFees {
    queryId: uint64;
    requiredCCVs: array<address>;                   // Max 255; empty = use lane defaults.
    fees: Cell<TokenPool_FeeContext>;
    fwdPayload: cell?;
}

/// Failure reply finalizing a CCV query that could not complete (e.g. the hooks bounced),
/// so the caller can abort/resume using the echoed `fwdPayload`.
struct (0x0449d467) TokenPool_GetCCVsFailed {
    queryId: uint64;
    errorCode: int32;                               // Raw TVM exit code; signed, can be negative (OOG is -14).
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
    requiredCCVs: array<address>;                   // Max 255.
    replyPayload: cell?;                            // Cell<TokenPool_GetCCVsContext> echoed back.
}

type TokenPool_InMessage =
    | TokenPool_LockOrBurn
    | TransferNotificationForRecipient // fwdPayload = TokenPool_LockOrBurnForwardPayload
    | TokenPool_PreflightCheckFinished
    | TokenPool_PreflightCheckFailed
    | TokenPool_LockOrBurnWithdrawFailed
    | TokenPool_ReleaseOrMint
    | TokenPool_ReleaseOrMintDelivered
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
    | TokenPool_SetRateLimitConfig
    | TokenPool_ApplyTokenTransferFeeConfigUpdates
    | TokenPool_SetBudget
    | TokenPool_GetConfig
    | TokenPool_Curse
    | TokenPool_Uncurse
    | TokenPool_RMNOwnableMessage
    | TokenPool_RMNAccessControlMessage
    | JettonWithdrawable_Withdraw;

struct (0xe7a35041) TokenPool_LockOrBurnWithdraw {
    queryId: uint64;
    /// TON the custody notification must carry to the pool (`TokenPool.custodyForward`). The
    /// sender's wallet forwards exactly this and rejects an underfunded transfer before custody
    /// moves.
    forwardTonAmount: coins;
    forwardPayload: TokenPool_LockOrBurnForwardPayload;
}

struct (0x9643c08d) TokenPool_LockOrBurnWithdrawFailed {
    queryId: uint64;
    forwardPayload: Cell<TokenPool_LockOrBurnForwardPayload>;
    errorCode: int32;                               // Raw TVM exit code (signed); see TokenPool_GetCCVsFailed.
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
    errorCode: int32;                               // Raw TVM exit code (signed); see TokenPool_GetCCVsFailed.
}

/// Sent to the ReceiveExecutor once the pool processed `TokenPool_ReleaseOrMintDelivered`.
struct (0xedd4948a) TokenPool_ReleaseOrMintFinalized {
    queryId: uint64;
    out: Cell<TokenPool_ReleaseOrMintOutV1>;
}

struct (0xef0cb36e) TokenPool_ReleaseOrMintFailure {
    queryId: uint64;
    errorCode: int32;                               // Raw TVM exit code (signed); see TokenPool_GetCCVsFailed.
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
    | TokenPool_ReleaseOrMintFinalized
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
    | TokenPool_RateLimitConfiguredNotification
    | TokenPool_AdvancedPoolHooksSet
    | TokenPool_ChainUpdatesApplied
    | TokenPool_FeeConfigApplied
    | TokenPool_BudgetSet
    | TokenPool_Config;

type TokenPool_BouncedMessage =
    | TokenPool_LockOrBurnWithdraw
    | TokenPool_GetCCVs
    | TokenPool_PreflightCheck
    | TokenPool_PostflightCheck;

/// Asks a pool for the configuration the token admin registry caches: the initiator of its
/// release/mint deliveries and its admission budgets. Sent when a pool is set or refreshed, e.g.
/// after the pool owner changed its budget or hooks.
struct (0x480060f1) TokenPool_GetConfig {
    queryId: uint64;
}

/// Answer to `TokenPool_GetConfig`. A null initiator means the pool delivers by minting.
struct (0x1c8a40b8) TokenPool_Config {
    queryId: uint64;
    transferInitiator: address?;
    admission: TokenPool_AdmissionBudget;
}

/// Sets the pool's per-instance budget. Values only raise the pool-type defaults; zero keeps the
/// default. Owner-only. Refresh the registry afterwards so CCIP funds the new admission budget.
struct (0x1e54ab8b) TokenPool_SetBudget {
    queryId: uint64;
    budget: TokenPool_Budget;
}

/// Replied on `TokenPool_SetBudget` with the resulting effective budget.
struct (0xfa704988) TokenPool_BudgetSet {
    queryId: uint64;
    budget: TokenPool_Budget;
}
