import "../utils"

tolk 1.0

const ERROR_BUCKET_OVERFILLED = 1001
const ERROR_TOKEN_MAX_CAPACITY_EXCEEDED = 1002
const ERROR_TOKEN_RATE_LIMIT_REACHED = 1003
const ERROR_INVALID_RATE_LIMIT_RATE = 1004
const ERROR_DISABLED_NON_ZERO_RATE_LIMIT = 1005

/// @notice Event // TODO complete description
type RateLimiter_ConfigChanged = RateLimiter_Config

struct RateLimiter_TokenBucket {
    tokens: uint128 // ────╮ Current number of tokens that are in the bucket.
    lastUpdated: uint32 // │ Timestamp in seconds of the last token refill, good for 100+ years.
    isEnabled: bool // ────╯ Indication whether the rate limiting is enabled or not.
    capacity: uint128 // ──╮ Maximum number of tokens that can be in the bucket.
    rate: uint128 // ──────╯ Number of tokens per second that the bucket is refilled.
}

struct RateLimiter_Config {
    isEnabled: bool // Indication whether the rate limiting should be enabled.
    capacity: uint128 // ──╮ Specifies the capacity of the rate limiter.
    rate: uint128 // ──────╯ Specifies the rate of the rate limiter.
}

struct RateLimiter_Data {
    config: RateLimiter_Config
    bucket: RateLimiter_TokenBucket // The token bucket that is used for rate limiting.
}

struct RateLimiter {
    data: RateLimiter_Data
}

/// @notice _consume removes the given tokens from the pool, lowering the rate tokens allowed to be
/// consumed for subsequent calls.
/// @param requestTokens The total tokens to be consumed from the bucket.
/// @param tokenAddress The token to consume capacity for, use 0x0 to indicate aggregate value capacity.
/// @dev Reverts when requestTokens exceeds bucket capacity or available tokens in the bucket.
/// @dev emits removal of requestTokens if requestTokens is > 0.
fun RateLimiter._consume(mutate self, requestTokens, tokenAddress) {
    // If there is no value to remove or rate limiting is turned off, skip this step to reduce gas usage.
    if (!self.data.bucket.isEnabled || requestTokens == 0) {
        return;
    }

    var tokens: uint256 = self.data.bucket.tokens;
    var capacity: uint256 = self.data.bucket.capacity;
    var timeDiff: uint256 = blockchain.now() - self.data.bucket.lastUpdated;

    if (timeDiff != 0) {
        if (tokens > capacity) {
            throw ERROR_BUCKET_OVERFILLED; // TODO this should be a return? revert BucketOverfilled();
        }

        // Refill tokens when arriving at a new block time.
        tokens = _calculateRefill(capacity, tokens, timeDiff, self.data.bucket.rate);

        self.data.bucket.lastUpdated = uint32(blockchain.now());
    }

    if (capacity < requestTokens) {
        throw ERROR_TOKEN_MAX_CAPACITY_EXCEEDED; // TODO this should be a return? revert TokenMaxCapacityExceeded(capacity, requestTokens, tokenAddress);
    }
    if (tokens < requestTokens) {
        var rate: uint256 = self.data.bucket.rate;
        // Wait required until the bucket is refilled enough to accept this value, round up to next higher second.
        // Consume is not guaranteed to succeed after wait time passes if there is competing traffic.
        // This acts as a lower bound of wait time.
        var minWaitInSeconds: uint256 = ((requestTokens - tokens) + (rate - 1)) / rate;

        throw ERROR_TOKEN_RATE_LIMIT_REACHED; // TODO this should be a return? revert TokenRateLimitReached(minWaitInSeconds, tokens, tokenAddress);
    }
    tokens -= requestTokens;

    // Downcast is safe here, as tokens is not larger than capacity.
    self.data.bucket.tokens = uint128(tokens);
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun RateLimiter._currentTokenBucketState(self): RateLimiter_TokenBucket {
    // We update the bucket to reflect the status at the exact time of the call. This means we might need to refill a
    // part of the bucket based on the time that has passed since the last update.
    var bucket = self.data.bucket;
    bucket.tokens = uint128(_calculateRefill(
        bucket.capacity,
        bucket.tokens,
        blockchain.now() - bucket.lastUpdated,
        bucket.rate
    ));
    bucket.lastUpdated = uint32(blockchain.now());
    return bucket;
}

/// @notice Sets the rate limited config.
/// @param s_bucket The token bucket.
/// @param config The new config.
fun RateLimiter._setTokenBucketConfig(mutate self, config) {
    // First update the bucket to make sure the proper rate is used for all the time up until the config change.
    var timeDiff: uint256 = blockchain.now() - self.data.bucket.lastUpdated;
    if (timeDiff != 0) {
        self.data.bucket.tokens = uint128(_calculateRefill(
            self.data.bucket.capacity,
            self.data.bucket.tokens,
            timeDiff,
            self.data.bucket.rate
        ));

        self.data.bucket.lastUpdated = uint32(blockchain.now());
    }

    self.data.bucket.tokens = uint128(_min(config.capacity, self.data.bucket.tokens));
    // TBD why doesn't RateLimiter have a `config: Config` attribute instead of repeating the fields?
    self.data.bucket.isEnabled = config.isEnabled;
    self.data.bucket.capacity = config.capacity;
    self.data.bucket.rate = config.rate;

    emit(RateLimiter_ConfigChanged(config));
}

/// @notice Validates the token bucket config.
fun RateLimiter._validateTokenBucketConfig(config: RateLimiter_Config) {
    if (config.isEnabled) {
        if (config.rate > config.capacity) {
            throw ERROR_INVALID_RATE_LIMIT_RATE; // TODO this should be a return? revert InvalidRateLimitRate(config);
        }
    } else {
        if (config.rate != 0 || config.capacity != 0) {
            throw ERROR_DISABLED_NON_ZERO_RATE_LIMIT; // TODO this should be a return? revert DisabledNonZeroRateLimit(config);
        }
    }
}

/// @notice Calculate refilled tokens.
/// @param capacity bucket capacity.
/// @param tokens current bucket tokens.
/// @param timeDiff block time difference since last refill.
/// @param rate bucket refill rate.
/// @return the value of tokens after refill.
fun _calculateRefill(capacity: uint256, tokens: uint256, timeDiff: uint256, rate: uint256): uint256 {
    return _min(capacity, tokens + timeDiff * rate);
}

/// @notice Return the smallest of two integers.
/// @param a first int.
/// @param b second int.
/// @return smallest.
fun _min(a: uint256, b: uint256): uint256 {
    if (a < b) {
        return a;
    }
    return b;
}
