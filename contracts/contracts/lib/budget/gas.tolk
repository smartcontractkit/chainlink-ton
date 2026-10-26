// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

/// Standard gas-budget levels, in gas units. On basechain 1 gas unit ≈ 66.67 nanotons (governance
/// config param 21: raw gas_price 4369067 scaled by 2^16), so ~15_000_000 units ≈ 1 TON. Reference
/// points:
///   - a jetton transfer (send + receive)   ≈ 13_000 units
///   - storing one cell for 5 years         ≈  3_000 units
///   - the default message budget           = 30_000 units (accept + validate + bounce)
const BUDGET_UNITS_LVL0_MIN     = 30_000;      // ≈0.002 TON  accept + validate + bounce
const BUDGET_UNITS_LVL1_LOW     = 60_000;      // ≈0.004 TON  + one reply
const BUDGET_UNITS_LVL2_MID     = 120_000;     // ≈0.008 TON  a jetton transfer + notification
const BUDGET_UNITS_LVL3_HIGH    = 250_000;     // ≈0.017 TON  full custody return (transfer + notify + reply)
const BUDGET_UNITS_LVL4_XHIGH   = 1_000_000;   // ≈0.067 TON  multi-hop / fan-out operation (tx max limit)
const BUDGET_UNITS_LVL5_XXHIGH  = 2_500_000;   // ≈0.167 TON  very high budget
const BUDGET_UNITS_LVL6_XXXHIGH = 10_000_000;  // ≈0.667 TON  extremely high budget (10x tx max limit)
const BUDGET_UNITS_LVL7_MAX     = 25_000_000;  // ≈1.667 TON  worst-case multi-hop rollback (25x tx max limit)

const BUDGET_TX_MAX = 1_000_000; // LVL4_XHIGH

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

/// Reserves the balance the account had before this inbound message plus any storage due, so
/// action-phase sends *and external-out events* are funded by the inbound value.
///
/// `getOriginalBalance()` already includes the inbound value, hence the subtraction; callers must
/// pass the actual inbound `in.valueCoins`. The reserve must be installed before the first send or
/// emit in the transaction. `RESERVE_MODE_AT_MOST` is best-effort: if gas/fees/events exceed the
/// inbound value, the reserve is capped at the available balance and the pre-message balance may
/// be touched. Success paths rely on the admission gates to make that impossible; recovery paths
/// deliberately accept it rather than roll back.
fun reserveBalanceBeforeInMessage(msgValue: coins): void {
    val rentDue = contract.getStorageDuePayment();
    val originalBalance = contract.getOriginalBalance();
    val balanceBeforeMessage = originalBalance > msgValue
        ? originalBalance - msgValue
        : 0 as coins;
    reserveGramsOnBalance(balanceBeforeMessage + rentDue, RESERVE_MODE_AT_MOST);
}
