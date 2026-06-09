// SPDX-License-Identifier: BUSL-1.1
import "../common/types"
import "types"

const TOKEN_POOL_LOCKED_OR_BURNED_TOPIC = stringCrc32("TokenPool_LockedOrBurned");
const TOKEN_POOL_RELEASED_OR_MINTED_TOPIC = stringCrc32("TokenPool_ReleasedOrMinted");
const TOKEN_POOL_CHAIN_ADDED_TOPIC = stringCrc32("TokenPool_ChainAdded");
const TOKEN_POOL_CHAIN_REMOVED_TOPIC = stringCrc32("TokenPool_ChainRemoved");
const TOKEN_POOL_REMOTE_POOL_ADDED_TOPIC = stringCrc32("TokenPool_RemotePoolAdded");
const TOKEN_POOL_REMOTE_POOL_REMOVED_TOPIC = stringCrc32("TokenPool_RemotePoolRemoved");
const TOKEN_POOL_DYNAMIC_CONFIG_SET_TOPIC = stringCrc32("TokenPool_DynamicConfigSet");
const TOKEN_POOL_RAMP_ACCESS_UPDATED_TOPIC = stringCrc32("TokenPool_RampAccessUpdated");
const TOKEN_POOL_CURSED_SUBJECTS_UPDATED_TOPIC = stringCrc32("TokenPool_CursedSubjectsUpdated");
const TOKEN_POOL_FINALITY_CONFIG_SET_TOPIC = stringCrc32("TokenPool_FinalityConfigSet");

struct TokenPool_LockedOrBurnedDetails {
    token: address;
    sender: address;
    amount: uint256;
}

//   event LockedOrBurned(uint64 indexed remoteChainSelector, address token, address sender, uint256 amount);
//   event ReleasedOrMinted(
//     uint64 indexed remoteChainSelector, address token, address sender, address recipient, uint256 amount
//   );
struct TokenPool_LockedOrBurned {
    remoteChainSelector: uint64;
    details: Cell<TokenPool_LockedOrBurnedDetails>;
}

struct TokenPool_ReleasedOrMintedParticipants {
    sender: address;
    recipient: address;
}

struct TokenPool_ReleasedOrMintedDetails {
    token: address;
    amount: uint256;
    participants: Cell<TokenPool_ReleasedOrMintedParticipants>;
}

struct TokenPool_ReleasedOrMinted {
    remoteChainSelector: uint64;
    details: Cell<TokenPool_ReleasedOrMintedDetails>;
}

struct TokenPool_ChainAdded {
    remoteChainSelector: uint64;
    remoteTokenAddress: Cell<CrossChainAddress>;
    // outboundRateLimiterConfig: RateLimiter.Config;
    // inboundRateLimiterConfig: RateLimiter.Config;
}

struct TokenPool_ChainRemoved {
    remoteChainSelector: uint64;
}

// TODO: make reply message
struct TokenPool_RemotePoolAdded {
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

// TODO: make reply message
struct TokenPool_RemotePoolRemoved {
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

//   event DynamicConfigSet(address router, address rateLimitAdmin, address feeAdmin);
struct TokenPool_DynamicConfigSet {
    router: address;
    rateLimitAdmin: address?;
    feeAdmin: address?;
}

// TODO: make used
struct TokenPool_OutboundRateLimitConsumed {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

// TODO: make used
struct TokenPool_InboundRateLimitConsumed {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

// TODO: make used
struct TokenPool_TokenTransferFeeConfigUpdated {
    remoteChainSelector: uint64;
    tokenTransferFeeConfig: Cell<TokenPool_TokenTransferFeeConfig>;
}

// TODO: make used
struct TokenPool_TokenTransferFeeConfigDeleted {
    remoteChainSelector: uint64;
}

//   event FinalityConfigSet(bytes4 allowedFinality);
struct TokenPool_FinalityConfigSet {
    allowedFinalityConfig: uint32;
}

//   event FastFinalityOutboundRateLimitConsumed(uint64 indexed remoteChainSelector, address token, uint256 amount);
//   event FastFinalityInboundRateLimitConsumed(uint64 indexed remoteChainSelector, address token, uint256 amount);
//   event RateLimitConfigured(
//     uint64 indexed remoteChainSelector,
//     bool fastFinality,
//     RateLimiter.Config outboundRateLimiterConfig,
//     RateLimiter.Config inboundRateLimiterConfig
//   );
//   event AdvancedPoolHooksUpdated(IAdvancedPoolHooks oldHook, IAdvancedPoolHooks newHook);

struct TokenPool_RampAccessUpdated {
    remoteChainSelector: uint64;
    onRamp: address? = null;
    offRamp: address? = null;
}

struct TokenPool_CursedSubjectsUpdated {}
