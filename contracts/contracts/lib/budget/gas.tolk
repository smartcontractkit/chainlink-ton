// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

/// Standard gas-budget levels, in gas units. On basechain 1 gas unit = 400 nanotons (governance
/// config param 21), so 2_500_000 units ≈ 1 TON. Reference points:
///   - a jetton transfer (send + receive)   ≈ 13_000 units
///   - storing one cell for 5 years         ≈  3_000 units
///   - the default message budget           = 30_000 units (accept + validate + bounce)
const BUDGET_UNITS_LVL0_MIN   = 30_000;    // ≈0.012 TON  accept + validate + bounce
const BUDGET_UNITS_LVL1_LOW   = 60_000;    // ≈0.024 TON  + one reply
const BUDGET_UNITS_LVL2_MID   = 120_000;   // ≈0.048 TON  a jetton transfer + notification
const BUDGET_UNITS_LVL3_HIGH  = 250_000;   // ≈0.100 TON  full custody return (transfer + notify + reply)
const BUDGET_UNITS_LVL4_XHIGH = 625_000;   // ≈0.250 TON  very high budget for complex operations
const BUDGET_UNITS_LVL5_MAX   = 1_250_000; // ≈0.500 TON  worst-case multi-hop rollback

/// Default message forwarding budget (gas units) for replies / notifications.
const DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS = BUDGET_UNITS_LVL0_MIN;

/// Fee-size tiers for [calculateGasFeeFor].
const FEE_SIZE_SMALL = 1;
const FEE_SIZE_DEFAULT = 2;
const FEE_SIZE_LARGE = 3;

/// Gas fee for the current workchain at the default message budget.
fun calculateGasFeeDefault(): coins {
    return calculateGasFee(contract.getAddress().getWorkchain(), DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS);
}

/// Gas fee for a fee-size tier (small = half, large = double the default).
fun calculateGasFeeFor(size: int): coins {
    if (size == FEE_SIZE_SMALL) {
        return calculateGasFeeDefault() / 2
    } else if (size == FEE_SIZE_LARGE) {
        return calculateGasFeeDefault() * 2;
    }
    return calculateGasFeeDefault();
}
