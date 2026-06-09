// SPDX-License-Identifier: BUSL-1.1

struct RateLimiter_Config {
    isEnabled: bool;
    capacity: uint256;
    rate: uint256;
}

struct RateLimiter_TokenBucket {
    tokens: uint256;
    lastUpdated: uint64;
    isEnabled: bool;
    capacity: uint256;
    rate: uint256;
}

fun RateLimiter_tokenBucketFromConfig(config: RateLimiter_Config): RateLimiter_TokenBucket {
    return RateLimiter_TokenBucket {
        tokens: config.capacity,
        lastUpdated: blockchain.now(),
        isEnabled: config.isEnabled,
        capacity: config.capacity,
        rate: config.rate,
    };
}

fun RateLimiter_consumeBucket(mutate bucket: RateLimiter_TokenBucket, amount: uint256) {
    if (!bucket.isEnabled) {
        return;
    }

    RateLimiter_refillBucket(mutate bucket);
    // TODO: should be RateLimiter error
    // assert(bucket.tokens >= amount, TokenPool_Error.RateLimitExceeded);
    bucket.tokens -= amount;
}

fun RateLimiter_rateLimitConfigFromCell(data: cell): RateLimiter_Config {
    var cs = data.beginParse();
    val isEnabled = cs.loadUint(1) != 0;
    val capacity = cs.loadUint(256);
    val rate = cs.loadUint(256);
    cs.assertEnd();
    return RateLimiter_Config {
        isEnabled,
        capacity,
        rate,
    };
}

fun RateLimiter_refillBucket(mutate bucket: RateLimiter_TokenBucket) {
    if (!bucket.isEnabled) {
        return;
    }

    val nowTs = blockchain.now();
    if (nowTs <= bucket.lastUpdated) {
        return;
    }

    val elapsed = nowTs - bucket.lastUpdated;
    val refill = (elapsed as uint256) * bucket.rate;
    if (refill == 0) {
        bucket.lastUpdated = nowTs;
        return;
    }

    val nextTokens = bucket.tokens + refill;
    bucket.tokens = nextTokens > bucket.capacity ? bucket.capacity : nextTokens;
    bucket.lastUpdated = nowTs;
}
