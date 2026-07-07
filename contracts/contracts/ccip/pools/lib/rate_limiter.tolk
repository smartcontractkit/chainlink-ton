// SPDX-License-Identifier: BUSL-1.1

const RateLimiter_FACILITY_NAME = "link.chain.ton.ccip.rateLimiter";
const RateLimiter_FACILITY_ID = 263;  // (crc32(<facility>) % 640) + 10 // TODO: update with computed val

enum RateLimiter_Error {
    BucketOverfilled = RateLimiter_FACILITY_ID * 100
    TokenMaxCapacityExceeded // (uint256 capacity, uint256 requested, address tokenAddress);
    TokenRateLimitReached    // (uint256 minWaitInSeconds, uint256 available, address tokenAddress);
    InvalidRateLimitConfig   // (Config rateLimiterConfig);
    DisabledNonZeroRateLimit // (Config config);
}

struct RateLimiter_Config {
    isEnabled: bool // Indication whether the rate limiting should be enabled.
    capacity: uint128 // ──╮ Specifies the capacity of the rate limiter.
    rate: uint128 // ──────╯ Specifies the rate of the rate limiter.
}

struct RateLimiter_TokenBucket {
    tokens: uint128 // ────╮ Current number of tokens that are in the bucket.
    lastUpdated: uint64 // │ Timestamp in seconds of the last token refill, good for 100+ years.
    isEnabled: bool // ────╯ Indication whether the rate limiting is enabled or not.
    capacity: uint128 // ──╮ Maximum number of tokens that can be in the bucket.
    rate: uint128 // ──────╯ Number of tokens per second that the bucket is refilled.
}

fun RateLimiter_TokenBucket.fromConfig(config: RateLimiter_Config): RateLimiter_TokenBucket {
    return RateLimiter_TokenBucket {
        tokens: config.capacity,
        lastUpdated: blockchain.now(),
        isEnabled: config.isEnabled,
        capacity: config.capacity,
        rate: config.rate,
    };
}

/// @notice _consume removes the given tokens from the pool, lowering the rate tokens allowed to be
/// consumed for subsequent calls.
/// @param requestTokens The total tokens to be consumed from the bucket.
/// @param tokenAddress The token to consume capacity for, use 0x0 to indicate aggregate value capacity.
/// @dev Reverts when requestTokens exceeds bucket capacity or available tokens in the bucket.
/// @dev emits removal of requestTokens if requestTokens is > 0.
fun RateLimiter_TokenBucket._consume(mutate self, requestTokens: uint256, _tokenAddress: address) {
    // If there is no value to remove or rate limiting is turned off, skip this step to reduce gas usage.
    if (!self.isEnabled || requestTokens == 0) {
        return;
    }

    var tokens = self.tokens;
    val capacity = self.capacity;
    val timeDiff = blockchain.now() - self.lastUpdated;

    // Refill tokens for elapsed time.
    tokens = self._applyElapsedRefill(tokens, capacity, timeDiff);

    if (capacity < requestTokens) {
        throw RateLimiter_Error.TokenMaxCapacityExceeded;
    }
    if (tokens < requestTokens) {
        var rate = self.rate;
        if (rate == 0) {
            // No tokens will ever be refilled. Check is required to avoid division by zero later.
            throw RateLimiter_Error.TokenRateLimitReached;
        }
        // Wait required until the bucket is refilled enough to accept this value, round up to next higher second.
        // Consume is not guaranteed to succeed after wait time passes if there is competing traffic.
        // This acts as a lower bound of wait time.
        val _minWaitInSeconds = ((requestTokens - tokens) + (rate - 1)) / rate;

        throw RateLimiter_Error.TokenRateLimitReached; // TODO this should be a return? revert TokenRateLimitReached(minWaitInSeconds, tokens, tokenAddress);
    }
    tokens -= requestTokens;

    // Downcast is safe here, as tokens is not larger than capacity.
    self.tokens = tokens as uint128;
}

/// @notice _refund returns previously consumed tokens to the bucket. Used when an async
/// operation that consumed capacity at admission later fails (e.g. a transfer bounces), so
/// the reserved capacity must be made available again.
/// @param refundTokens The number of tokens to return to the bucket.
/// @dev Refilling for elapsed time is applied first (consistent with _consume), then the
/// refund is added, capped at capacity so the bucket can never exceed its maximum.
fun RateLimiter_TokenBucket._refund(mutate self, refundTokens: uint256, _tokenAddress: address) {
    // If there is nothing to refund or rate limiting is off, skip to reduce gas usage.
    if (!self.isEnabled || refundTokens == 0) {
        return;
    }

    var tokens = self.tokens;
    val capacity = self.capacity;
    val timeDiff = blockchain.now() - self.lastUpdated;

    // Refill tokens for elapsed time.
    tokens = self._applyElapsedRefill(tokens, capacity, timeDiff);

    val restored = (tokens as uint256) + refundTokens;
    // Cap at capacity: refunds can never overfill the bucket.
    self.tokens = (restored > (capacity as uint256) ? capacity : restored as uint128);
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun RateLimiter_TokenBucket._currentTokenBucketState(mutate self): RateLimiter_TokenBucket {
    // We update the bucket to reflect the status at the exact time of the call. This means we might need to refill a
    // part of the bucket based on the time that has passed since the last update.
    self.tokens = _calculateRefill(
        self.capacity,
        self.tokens,
        blockchain.now() - self.lastUpdated,
        self.rate
    );
    self.lastUpdated = blockchain.now();
    return self;
}

/// @notice Sets the rate limited config.
/// @param s_bucket The token bucket.
/// @param config The new config.
fun RateLimiter_TokenBucket._setTokenBucketConfig(mutate self, config: RateLimiter_Config) {
    config.validate();

    self.isEnabled = config.isEnabled;
    self.tokens = config.capacity;
    self.capacity = config.capacity;
    self.rate = config.rate;
    self.lastUpdated = blockchain.now();
}

/// @notice Refills tokens for elapsed time and updates lastUpdated on the bucket.
/// @param bucket The token bucket to update.
/// @param tokens The current (stale) token count.
/// @param capacity The bucket capacity.
/// @param timeDiff Seconds elapsed since the last update.
/// @return The token count after refill.
fun RateLimiter_TokenBucket._applyElapsedRefill(mutate self, tokens: uint128, capacity: uint128, timeDiff: uint256): uint128 {
    if (timeDiff != 0) {
        if (tokens > capacity) {
            throw RateLimiter_Error.BucketOverfilled;
        }

        val newTokens = _calculateRefill(capacity, tokens, timeDiff, self.rate);
        self.lastUpdated = blockchain.now();

        return newTokens;
    }

    return tokens;
}

/// @notice Validates the token bucket config.
fun RateLimiter_Config.validate(self) {
    if (self.isEnabled) {
        if (self.rate > self.capacity) {
            throw RateLimiter_Error.InvalidRateLimitConfig;
        }
    } else {
        if (self.rate != 0 || self.capacity != 0) {
            throw RateLimiter_Error.DisabledNonZeroRateLimit;
        }
    }
}

/// @notice Calculate refilled tokens.
/// @param capacity bucket capacity.
/// @param tokens current bucket tokens.
/// @param timeDiff block time difference since last refill.
/// @param rate bucket refill rate.
/// @return the value of tokens after refill.
fun _calculateRefill(capacity: uint128, tokens: uint128, timeDiff: uint256, rate: uint128): uint128 {
    return _min(capacity, (tokens as uint256 + timeDiff * rate as uint256) as uint128);
}

/// @notice Return the smallest of two integers.
/// @param a first int.
/// @param b second int.
/// @return smallest.
fun _min(a: uint128, b: uint128): uint128 {
    if (a < b) {
        return a;
    }
    return b;
}
