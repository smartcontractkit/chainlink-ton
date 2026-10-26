// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

/// Rollback-safe message-value floors (generic; protocol-agnostic).
///
/// `minValue = calculateGasFee(workchain, gasUnits) * buffer`, expressed in GAS UNITS so a
/// governance gas-price change is tracked at runtime instead of silently invalidating a
/// hardcoded TON constant. Each protocol defines its own gas units and buffer on top of this.
///
/// See docs/contracts/overview/ccip/MIN-VALUE-CHECKS.md.

/// Optional override of a min-value floor. Empty => use the component default.
struct MinValueConfig {
    value: coins? = null;
}

/// Returns the configured override, or `default` when none is set.
fun MinValueConfig.resolve(self, default: coins): coins {
    return self.value != null ? self.value! : default;
}

/// Asserts the inbound message value meets a floor.
/// @param errorCode A protocol-scoped error code (e.g. `TokenPool_Error.InsufficientMessageValue`).
fun assertMinValue(value: coins, minValue: coins, errorCode: int): void {
    assert(value >= minValue, errorCode);
}
