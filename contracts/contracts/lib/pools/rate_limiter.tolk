import "../utils"

tolk 1.0

const RateLimiter_ERROR_BUCKET_OVERFILLED = 1001
const RateLimiter_ERROR_TOKEN_MAX_CAPACITY_EXCEEDED = 1002
const RateLimiter_ERROR_TOKEN_RATE_LIMIT_REACHED = 1003
const RateLimiter_ERROR_INVALID_RATE_LIMIT_RATE = 1004
const RateLimiter_ERROR_DISABLED_NON_ZERO_RATE_LIMIT = 1005

//crc32("RateLimiter_ConfigChanged")
const RATELIMITER_CONFIGCHANGED_TOPIC: int = stringCrc32("RateLimiter_ConfigChanged");

/// @notice Event // TODO complete description
struct RateLimiter_ConfigChanged { config: RateLimiter_Config }

struct RateLimiter_TokenBucket {
    tokens: uint128 // ────╮ Current number of tokens that are in the bucket.
    lastUpdated: uint32 // │ Timestamp in seconds of the last token refill, good for 100+ years.
    isEnabled: bool // ────╯ Indication whether the rate limiting is enabled or not.
    capacity: uint128 // ──╮ Maximum number of tokens that can be in the bucket.
    rate: uint128 // ──────╯ Number of tokens per second that the bucket is refilled.
}

const RATE_LIMITER_CONFIG_LEN = 1 + 128 + 128

struct RateLimiter_Config {
    isEnabled: bool // Indication whether the rate limiting should be enabled.
    capacity: uint128 // ──╮ Specifies the capacity of the rate limiter.
    rate: uint128 // ──────╯ Specifies the rate of the rate limiter.
}

struct RateLimiter_Data {
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
fun RateLimiter_TokenBucket._consume(mutate self, requestTokens: uint256, tokenAddress: address) {
    // If there is no value to remove or rate limiting is turned off, skip this step to reduce gas usage.
    if (!self.isEnabled || requestTokens == 0) {
        return;
    }

    var tokens = self.tokens;
    var capacity = self.capacity;
    var timeDiff = blockchain.now() - self.lastUpdated;

    if (timeDiff != 0) {
        if (tokens > capacity) {
            throw RateLimiter_ERROR_BUCKET_OVERFILLED; // TODO this should be a return? revert BucketOverfilled();
        }

        // Refill tokens when arriving at a new block time.
        tokens = _calculateRefill(capacity, tokens, timeDiff, self.rate);

        self.lastUpdated = blockchain.now();
    }

    if (capacity < requestTokens) {
        throw RateLimiter_ERROR_TOKEN_MAX_CAPACITY_EXCEEDED; // TODO this should be a return? revert TokenMaxCapacityExceeded(capacity, requestTokens, tokenAddress);
    }
    if (tokens < requestTokens) {
        var rate = self.rate;
        // Wait required until the bucket is refilled enough to accept this value, round up to next higher second.
        // Consume is not guaranteed to succeed after wait time passes if there is competing traffic.
        // This acts as a lower bound of wait time.
        var minWaitInSeconds = ((requestTokens - tokens) + (rate - 1)) / rate;

        throw RateLimiter_ERROR_TOKEN_RATE_LIMIT_REACHED; // TODO this should be a return? revert TokenRateLimitReached(minWaitInSeconds, tokens, tokenAddress);
    }
    tokens -= requestTokens;

    // Downcast is safe here, as tokens is not larger than capacity.
    self.tokens = tokens;
}

/// @notice Gets the token bucket with its values for the block it was requested at.
/// @return The token bucket.
fun RateLimiter_TokenBucket._currentTokenBucketState(self): RateLimiter_TokenBucket {
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
fun RateLimiter._setTokenBucketConfig(mutate self, config: RateLimiter_Config) {
    // First update the bucket to make sure the proper rate is used for all the time up until the config change.
    var timeDiff: uint256 = blockchain.now() - self.data.bucket.lastUpdated;
    if (timeDiff != 0) {
        self.data.bucket.tokens = _calculateRefill(
            self.data.bucket.capacity,
            self.data.bucket.tokens,
            timeDiff,
            self.data.bucket.rate
        );

        self.data.bucket.lastUpdated = blockchain.now();
    }

    self.data.bucket.tokens = _min(config.capacity, self.data.bucket.tokens);
    // TBD why doesn't RateLimiter have a `config: Config` attribute instead of repeating the fields?
    self.data.bucket.isEnabled = config.isEnabled;
    self.data.bucket.capacity = config.capacity;
    self.data.bucket.rate = config.rate;

    emit(RATELIMITER_CONFIGCHANGED_TOPIC, RateLimiter_ConfigChanged{ config });
}

/// @notice Validates the token bucket config.
fun RateLimiter._validateTokenBucketConfig(config: RateLimiter_Config) {
    if (config.isEnabled) {
        if (config.rate > config.capacity) {
            throw RateLimiter_ERROR_INVALID_RATE_LIMIT_RATE; // TODO this should be a return? revert InvalidRateLimitRate(config);
        }
    } else {
        if (config.rate != 0 || config.capacity != 0) {
            throw RateLimiter_ERROR_DISABLED_NON_ZERO_RATE_LIMIT; // TODO this should be a return? revert DisabledNonZeroRateLimit(config);
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
