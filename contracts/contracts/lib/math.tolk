// SPDX-License-Identifier: MIT
/*
 * Safe Math Library for Tolk
 * 
 * This library provides overflow-safe arithmetic operations for Tolk's 257-bit signed integers.
 * 
 * Error codes:
 * 0 - No error (success)
 * 1 - Positive overflow
 * 2 - Negative overflow (underflow)  
 * 3 - Division/modulo by zero
 * 
 * Usage patterns:
 * 1. Use safe* functions when you want to handle errors gracefully
 * 2. Use must* functions when you want to throw on overflow (fail-fast)
 * 3. All functions are designed to be gas-efficient and secure
 */

// int is a 257-bit signed integer
// These are its max/min values
// For a 257-bit signed integer: max = 2^256 - 1, min = -2^256
// We calculate max as: 2^255 - 1 + 2^255 = 2^256 - 1 (avoiding overflow)
const INT_MAX: int = ((1 << 255) - 1) + (1 << 255);
const INT_MIN: int = -(1 << 255) - (1 << 255);

const MAX_UINT8: uint8 = 0xFF; // 255
const MAX_UINT256: uint256 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

const MAX_EXP10: uint8 = 77;

// Returns (result, errorCode), where errorCode is 0 if no error.
fun safeAdd(a: int, b: int): (int, int) {
    // Check for positive overflow: a > INT_MAX - b
    if (b > 0 && a > INT_MAX - b) {
        return (0, 1); // overflow error
    }
    
    // Check for negative overflow: a < INT_MIN - b
    if (b < 0 && a < INT_MIN - b) {
        return (0, 2); // underflow error
    }
    
    return (a + b, 0); // success
}

// Returns (result, errorCode), where errorCode is 0 if no error.
fun safeProd(a: int, b: int): (int, int) {
    // Handle zero cases
    if (a == 0 || b == 0) {
        return (0, 0);
    }
    
    // Handle -1 special case to avoid division by zero
    if (a == -1) {
        if (b == INT_MIN) {
            return (0, 1); // overflow: -1 * INT_MIN = overflow
        }
        return (-b, 0);
    }
    
    if (b == -1) {
        if (a == INT_MIN) {
            return (0, 1); // overflow: INT_MIN * -1 = overflow
        }
        return (-a, 0);
    }
    
    // Check for overflow by division
    // If a > 0 and b > 0: check a <= INT_MAX / b
    // If a < 0 and b < 0: check a >= INT_MAX / b (both negative)
    // If a > 0 and b < 0: check a <= INT_MIN / b (will be negative check)
    // If a < 0 and b > 0: check a >= INT_MIN / b (will be negative check)
    
    if (a > 0 && b > 0) {
        if (a > INT_MAX / b) {
            return (0, 1); // overflow
        }
    } else if (a < 0 && b < 0) {
        if (a < INT_MAX / b) {
            return (0, 1); // overflow (both negative, result positive)
        }
    } else if (a > 0 && b < 0) {
        if (b < INT_MIN / a) {
            return (0, 2); // underflow
        }
    } else { // a < 0 && b > 0
        if (a < INT_MIN / b) {
            return (0, 2); // underflow
        }
    }
    
    return (a * b, 0); // success
}

// @dev Calculates 10^n for n <= 77 in O(log n). For n > 77, it would overflow uint256.
// TODO test limits
fun safePow10(n: uint8): (uint256, int) {
    if (n > MAX_EXP10) {
        return (0, 1); // overflow error
    }

    var result: uint256 = 1;
    var base: uint256 = 10;

    while (n > 0) {
        if ((n & 1) == 1) {
            // Check for potential overflow before multiplication
            assert(result == 0 || base <= MAX_UINT256 / result, 4); // exit code 4: Integer overflow
            result *= base;
        }
        base *= base;
        n >>= 1;
    }

    return (result, 0); // success
}

// Returns result or throws errCode on overflow.
fun mustAdd(a: int, b: int, errCode: int): int {
    val (res, err) = safeAdd(a, b);
    if (err != 0) {
        throw errCode;
    }
    return res;
}

// Returns result or throws errCode on overflow.
fun mustProd(a: int, b: int, errCode: int): int {
    val (res, err) = safeProd(a, b);
    if (err != 0) {
        throw errCode;
    }
    return res;
}

// Returns result or throws errCode on overflow.
fun mustPow10(n: uint8, errCode: int): uint256 {
    val (res, err) = safePow10(n);
    if (err != 0) {
        throw errCode;
    }
    return res;
}

const MAX_UINT4: uint4 = 0xF; // 15
/// According to [the documentation](https://docs.ton.org/tolk/types/numbers#serialization),
/// `coins` is an alias to `varuint16`, which is encoded by `4` bits of length followed by an `8 * length`-bit number.
/// 
/// Given that the maximum length is `0xF(15)`, the maximum value of coins is 2^(8*15) - 1 = 2^120 - 1
/// 
/// @note 2^n = 1 << n
const COIN_MAX: int = (1 << (MAX_UINT4*8)) - 1;

/// Returns `value` as `coins` if it is non negative and fits as a uint120 bits
/// Otherwise throws `errCode`
fun mustCastToCoin(value: int, errCode: int): coins {
    if (value < 0 || value > COIN_MAX) {
        throw errCode;
    }
    return value;
}

