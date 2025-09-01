import "../../../ccip/types"
import "../rate_limiter"

tolk 1.0

//crc32("TokenPool_LockedOrBurned")
const TOKENPOOL_LOCKEDORBURNED_TOPIC: int = stringCrc32("TokenPool_LockedOrBurned");
struct TokenPool_LockedOrBurned {
    remoteChainSelector: uint64
    token: address
    sender: address
    amount: uint256
}

// TBD it is questionable that this types are in the common token pool while they are only used by their respective implementations
//crc32("TokenPool_ReleasedOrMinted")
const TOKENPOOL_RELEASEDORMINTED_TOPIC: int = stringCrc32("TokenPool_ReleasedOrMinted");
struct TokenPool_ReleasedOrMinted {
    remoteChainSelector: uint64
    token: address
    sender: address
    recipient: address
    amount: uint256
}
//crc32("TokenPool_ChainAdded")
const TOKENPOOL_CHAINADDED_TOPIC: int = stringCrc32("TokenPool_ChainAdded");
struct TokenPool_ChainAdded {
    remoteChainSelector: uint64
    remoteToken: CrossChainAddress
    outboundRateLimiterConfig: RateLimiter_Config
    inboundRateLimiterConfig: RateLimiter_Config
}
//crc32("TokenPool_ChainConfigured")
const TOKENPOOL_CHAINCONFIGURED_TOPIC: int = stringCrc32("TokenPool_ChainConfigured");
struct TokenPool_ChainConfigured {
    remoteChainSelector: uint64
    outboundRateLimiterConfig: RateLimiter_Config
    inboundRateLimiterConfig: RateLimiter_Config
}
//crc32("TokenPool_ChainRemoved")
const TOKENPOOL_CHAINREMOVED_TOPIC: int = stringCrc32("TokenPool_ChainRemoved");
struct TokenPool_ChainRemoved {
    remoteChainSelector: uint64
}
//crc32("TokenPool_RemotePoolAdded")
const TOKENPOOL_REMOTEPOOLADDED_TOPIC: int = stringCrc32("TokenPool_RemotePoolAdded");
struct TokenPool_RemotePoolAdded {
    remoteChainSelector: uint64
    remotePoolAddress: slice
}
//crc32("TokenPool_RemotePoolRemoved")
const TOKENPOOL_REMOTEPOOLREMOVED_TOPIC: int = stringCrc32("TokenPool_RemotePoolRemoved");
struct TokenPool_RemotePoolRemoved {
    remoteChainSelector: uint64
    remotePoolAddress: CrossChainAddress
}
//crc32("TokenPool_AllowListAdd")
const TOKENPOOL_ALLOWLISTADD_TOPIC: int = stringCrc32("TokenPool_AllowListAdd");
struct TokenPool_AllowListAdd {
    sender: address
}
//crc32("TokenPool_AllowListRemove")
const TOKENPOOL_ALLOWLISTREMOVE_TOPIC: int = stringCrc32("TokenPool_AllowListRemove");
struct TokenPool_AllowListRemove {
    sender: address
}
//crc32("TokenPool_RouterUpdated")
const TOKENPOOL_ROUTERUPDATED_TOPIC: int = stringCrc32("TokenPool_RouterUpdated");
struct TokenPool_RouterUpdated {
    oldRouter: address
    newRouter: address
}
//crc32("TokenPool_RateLimitAdminSet")
const TOKENPOOL_RATELIMITADMINSET_TOPIC: int = stringCrc32("TokenPool_RateLimitAdminSet");
struct TokenPool_RateLimitAdminSet {
    rateLimitAdmin: address
}
//crc32("TokenPool_OutboundRateLimitConsumed")
const TOKENPOOL_OUTBOUNDRATELIMITCONSUMED_TOPIC: int = stringCrc32("TokenPool_OutboundRateLimitConsumed");
struct TokenPool_OutboundRateLimitConsumed {
    remoteChainSelector: uint64
    token: address
    amount: uint256
}
//crc32("TokenPool_InboundRateLimitConsumed")
const TOKENPOOL_INBOUNDRATELIMITCONSUMED_TOPIC: int = stringCrc32("TokenPool_InboundRateLimitConsumed");
struct TokenPool_InboundRateLimitConsumed {
    remoteChainSelector: uint64
    token: address
    amount: uint256
}