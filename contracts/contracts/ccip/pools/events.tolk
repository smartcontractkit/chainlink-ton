// SPDX-License-Identifier: BUSL-1.1
import "../common/types"

import "types"

const TOPIC_TOKEN_POOL_LOCKED_OR_BURNED = "TokenPool_LockedOrBurned".crc32();
const TOPIC_TOKEN_POOL_RELEASED_OR_MINTED = "TokenPool_ReleasedOrMinted".crc32();
const TOPIC_TOKEN_POOL_CHAIN_ADDED = "TokenPool_ChainAdded".crc32();
const TOPIC_TOKEN_POOL_CHAIN_REMOVED = "TokenPool_ChainRemoved".crc32();
const TOPIC_TOKEN_POOL_REMOTE_POOL_ADDED = "TokenPool_RemotePoolAdded".crc32();
const TOPIC_TOKEN_POOL_REMOTE_POOL_REMOVED = "TokenPool_RemotePoolRemoved".crc32();
const TOPIC_TOKEN_POOL_DYNAMIC_CONFIG_SET = "TokenPool_DynamicConfigSet".crc32();
const TOPIC_TOKEN_POOL_RAMP_ACCESS_UPDATED = "TokenPool_RampAccessUpdated".crc32();
const TOPIC_TOKEN_POOL_FINALITY_CONFIG_SET = "TokenPool_FinalityConfigSet".crc32();
const TOPIC_TOKEN_POOL_RATE_LIMIT_CONFIGURED = "TokenPool_RateLimitConfigured".crc32();
const TOPIC_TOKEN_POOL_FEE_CONFIG_UPDATED = "TokenPool_TokenTransferFeeConfigUpdated".crc32();
const TOPIC_TOKEN_POOL_FEE_CONFIG_DELETED = "TokenPool_TokenTransferFeeConfigDeleted".crc32();
const TOPIC_TOKEN_POOL_OUTBOUND_RATE_LIMIT_CONSUMED = "TokenPool_OutboundRateLimitConsumed".crc32();
const TOPIC_TOKEN_POOL_INBOUND_RATE_LIMIT_CONSUMED = "TokenPool_InboundRateLimitConsumed".crc32();
const TOPIC_TOKEN_POOL_FAST_FINALITY_OUTBOUND_RATE_LIMIT_CONSUMED = "TokenPool_FastFinalityOutboundRateLimitConsumed".crc32();
const TOPIC_TOKEN_POOL_FAST_FINALITY_INBOUND_RATE_LIMIT_CONSUMED = "TokenPool_FastFinalityInboundRateLimitConsumed".crc32();
const TOPIC_TOKEN_POOL_OUTBOUND_RATE_LIMIT_REFUNDED = "TokenPool_OutboundRateLimitRefunded".crc32();
const TOPIC_TOKEN_POOL_INBOUND_RATE_LIMIT_REFUNDED = "TokenPool_InboundRateLimitRefunded".crc32();
const TOPIC_TOKEN_POOL_FAST_FINALITY_OUTBOUND_RATE_LIMIT_REFUNDED = "TokenPool_FastFinalityOutboundRateLimitRefunded".crc32();
const TOPIC_TOKEN_POOL_FAST_FINALITY_INBOUND_RATE_LIMIT_REFUNDED = "TokenPool_FastFinalityInboundRateLimitRefunded".crc32();

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
    amount: uint256;
    recipient: Cell<address>;
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

/// Emitted when outbound rate-limit capacity is consumed in this pool.
struct TokenPool_OutboundRateLimitConsumed {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when inbound rate-limit capacity is consumed in this pool.
struct TokenPool_InboundRateLimitConsumed {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when fast-finality outbound rate-limit capacity is consumed.
/// Falls back to default bucket event when fast-finality is disabled.
struct TokenPool_FastFinalityOutboundRateLimitConsumed {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when fast-finality inbound rate-limit capacity is consumed.
/// Falls back to default bucket event when fast-finality is disabled.
struct TokenPool_FastFinalityInboundRateLimitConsumed {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when previously consumed outbound rate-limit capacity is refunded.
/// TON-specific: no EVM equivalent (EVM reverts synchronously, so refund is unnecessary).
struct TokenPool_OutboundRateLimitRefunded {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when previously consumed inbound rate-limit capacity is refunded.
/// TON-specific: no EVM equivalent (EVM reverts synchronously, so refund is unnecessary).
struct TokenPool_InboundRateLimitRefunded {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when previously consumed fast-finality outbound rate-limit capacity is refunded.
/// TON-specific: no EVM equivalent (EVM reverts synchronously, so refund is unnecessary).
struct TokenPool_FastFinalityOutboundRateLimitRefunded {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when previously consumed fast-finality inbound rate-limit capacity is refunded.
/// TON-specific: no EVM equivalent (EVM reverts synchronously, so refund is unnecessary).
struct TokenPool_FastFinalityInboundRateLimitRefunded {
    remoteChainSelector: uint64;
    token: address;
    amount: uint256;
}

/// Emitted when a token transfer fee configuration is updated for a destination chain.
struct TokenPool_TokenTransferFeeConfigUpdated {
    destChainSelector: uint64;
    tokenTransferFeeConfig: Cell<TokenPool_TokenTransferFeeConfig>;
}

/// Emitted when a token transfer fee configuration is deleted (disabled) for a destination chain.
struct TokenPool_TokenTransferFeeConfigDeleted {
    destChainSelector: uint64;
}

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
    | TokenPool_RampAccessUpdated
    | TokenPool_TokenTransferFeeConfigUpdated
    | TokenPool_TokenTransferFeeConfigDeleted
    | TokenPool_OutboundRateLimitConsumed
    | TokenPool_InboundRateLimitConsumed
    | TokenPool_FastFinalityOutboundRateLimitConsumed
    | TokenPool_FastFinalityInboundRateLimitConsumed
    | TokenPool_OutboundRateLimitRefunded
    | TokenPool_InboundRateLimitRefunded;
