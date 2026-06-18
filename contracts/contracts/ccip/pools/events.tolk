// SPDX-License-Identifier: BUSL-1.1
import "../common/types"

import "types"

const TOPIC_TOKEN_POOL_LOCKED_OR_BURNED = stringCrc32("TokenPool_LockedOrBurned");
const TOPIC_TOKEN_POOL_RELEASED_OR_MINTED = stringCrc32("TokenPool_ReleasedOrMinted");
const TOPIC_TOKEN_POOL_CHAIN_ADDED = stringCrc32("TokenPool_ChainAdded");
const TOPIC_TOKEN_POOL_CHAIN_REMOVED = stringCrc32("TokenPool_ChainRemoved");
const TOPIC_TOKEN_POOL_REMOTE_POOL_ADDED = stringCrc32("TokenPool_RemotePoolAdded");
const TOPIC_TOKEN_POOL_REMOTE_POOL_REMOVED = stringCrc32("TokenPool_RemotePoolRemoved");
const TOPIC_TOKEN_POOL_DYNAMIC_CONFIG_SET = stringCrc32("TokenPool_DynamicConfigSet");
const TOPIC_TOKEN_POOL_RAMP_ACCESS_UPDATED = stringCrc32("TokenPool_RampAccessUpdated");
const TOPIC_TOKEN_POOL_FINALITY_CONFIG_SET = stringCrc32("TokenPool_FinalityConfigSet");
const TOPIC_TOKEN_POOL_RATE_LIMIT_CONFIGURED = stringCrc32("TokenPool_RateLimitConfigured");

struct TokenPool_LockedOrBurned {
    remoteChainSelector: uint64;
    details: Cell<TokenPool_LockedOrBurnedDetails>;
}

struct TokenPool_LockedOrBurnedDetails {
    token: address;
    sender: address;
    amount: uint256;
}

struct TokenPool_ReleasedOrMinted {
    remoteChainSelector: uint64;
    details: Cell<TokenPool_ReleasedOrMintedDetails>;
}

struct TokenPool_ReleasedOrMintedDetails {
    token: address;
    sender: address;
    recipient: Cell<address>;
    amount: uint256;
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

/// Emitted when a remote pool is added.
struct TokenPool_RemotePoolAdded {
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
}

/// Emitted when a remote pool is removed.
struct TokenPool_RemotePoolRemoved {
    remoteChainSelector: uint64;
    remotePoolAddress: Cell<CrossChainAddress>;
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

//   event FastFinalityOutboundRateLimitConsumed(uint64 indexed remoteChainSelector, address token, uint256 amount);
//   event FastFinalityInboundRateLimitConsumed(uint64 indexed remoteChainSelector, address token, uint256 amount);

struct TokenPool_RateLimitConfigured {
    args: TokenPool_RateLimitConfigArgs;
}

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

type TokenPool_Events = 
    | TokenPool_ChainAdded
    | TokenPool_ChainRemoved
    | TokenPool_RateLimitConfigured
    | TokenPool_RampAccessUpdated;
