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

import "tvm/errors"

// int is a 257-bit signed integer
// These are its max/min values
// For a 257-bit signed integer: max = 2^256 - 1, min = -2^256
// We calculate max as: 2^255 - 1 + 2^255 = 2^256 - 1 (avoiding overflow)
const INT_MAX: int = ((1 << 255) - 1) + (1 << 255);
const INT_MIN: int = -(1 << 255) - (1 << 255);

const MAX_UINT8: uint8 = 0xFF; // 255
const MAX_UINT256: uint256 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

const MAX_EXP10: uint8 = 77;

enum Math_Result {
    Ok = 0
    Overflow
    Underflow
}

// Returns (result, errorCode), where errorCode is 0 if no error.
fun safeAdd(a: int, b: int): (int, Math_Result) {
    // Check for positive overflow: a > INT_MAX - b
    if (b > 0 && a > INT_MAX - b) {
        return (0, Math_Result.Overflow);
    }
    
    // Check for negative overflow: a < INT_MIN - b
    if (b < 0 && a < INT_MIN - b) {
        return (0, Math_Result.Underflow);
    }
    
    return (a + b, Math_Result.Ok); // success
}

// Returns (result, errorCode), where errorCode is 0 if no error.
fun safeProd(a: int, b: int): (int, Math_Result) {
    // Handle zero cases
    if (a == 0 || b == 0) {
        return (0, Math_Result.Ok);
    }
    
    // Handle -1 special case to avoid division by zero
    if (a == -1) {
        if (b == INT_MIN) {
            return (0, Math_Result.Overflow); // -1 * INT_MIN = overflow
        }
        return (-b, Math_Result.Ok);
    }
    
    if (b == -1) {
        if (a == INT_MIN) {
            return (0, Math_Result.Overflow); // overflow: INT_MIN * -1 = overflow
        }
        return (-a, Math_Result.Ok);
    }
    
    // Check for overflow by division
    // If a > 0 and b > 0: check a <= INT_MAX / b
    // If a < 0 and b < 0: check a >= INT_MAX / b (both negative)
    // If a > 0 and b < 0: check a <= INT_MIN / b (will be negative check)
    // If a < 0 and b > 0: check a >= INT_MIN / b (will be negative check)
    
    if (a > 0 && b > 0) {
        if (a > INT_MAX / b) {
            return (0, Math_Result.Overflow);
        }
    } else if (a < 0 && b < 0) {
        if (a < INT_MAX / b) {
            return (0, Math_Result.Overflow);
        }
    } else if (a > 0 && b < 0) {
        if (b < INT_MIN / a) {
            return (0, Math_Result.Underflow);
        }
    } else { // a < 0 && b > 0
        if (a < INT_MIN / b) {
            return (0, Math_Result.Underflow);
        }
    }
    
    return (a * b, Math_Result.Ok);
}

// @dev Calculates 10^n for n <= 77 in O(log n). For n > 77, it would overflow uint256.
fun safePow10(n: uint8): (uint256, Math_Result) {
    if (n > MAX_EXP10) {
        return (0, Math_Result.Overflow);
    }

    var result: uint256 = 1;
    var base: uint256 = 10;

    while (n > 0) {
        if ((n & 1) == 1) {
            // Check for potential overflow before multiplication (UNREACHABLE)
            assert(result == 0 || base <= MAX_UINT256 / result, TVMError.IntegerOverflow);
            result *= base;
        }
        n >>= 1;
        if (n > 0) {
            // Only square base if there are more bits to process,
            // otherwise base *= base may overflow uint256 unnecessarily.
            base *= base;
        }
    }

    return (result, Math_Result.Ok);
}

// Returns result or throws errCode on overflow.
fun mustAdd(a: int, b: int, errCode: int): int {
    val (res, err) = safeAdd(a, b);
    if (err != Math_Result.Ok) {
        throw errCode;
    }
    return res;
}

// Returns result or throws errCode on overflow.
fun mustProd(a: int, b: int, errCode: int): int {
    val (res, err) = safeProd(a, b);
    if (err != Math_Result.Ok) {
        throw errCode;
    }
    return res;
}

// Returns result or throws errCode on overflow.
fun mustPow10(n: uint8, errCode: int): uint256 {
    val (res, err) = safePow10(n);
    if (err != Math_Result.Ok) {
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

