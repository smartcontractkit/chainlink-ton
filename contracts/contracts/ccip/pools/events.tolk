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

type TokenPool_Events = 
    | TokenPool_ChainAdded
    | TokenPool_ChainRemoved
    | TokenPool_RampAccessUpdated;
