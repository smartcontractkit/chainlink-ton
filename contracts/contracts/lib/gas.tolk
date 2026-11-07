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

/// Minimum GRAM balance a long-lived contract (pool, lockbox, Timelock) should retain for storage
/// rent. It is a target, not a hard floor: pass it only where retaining it cannot starve a custody
/// action, a custody confirmation, or the init replies.
const MIN_GRAM_TO_RESERVE: coins = grams("0.05");

/// Default hard rent-reserve mode: fail the transaction if the target cannot be left.
const RESERVE_MODE_RENT = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;

/// Reserves the larger of the pre-message balance and `minBalance`, plus any storage due, so
/// action-phase sends *and external-out events* are funded by the inbound value.
///
/// `getOriginalBalance()` already includes the inbound value, hence the subtraction; callers must
/// pass the actual inbound `in.valueCoins`. The reserve must be installed before the first send or
/// emit in the transaction. Returns the reserved amount.
///
/// Defaults to `RESERVE_MODE_RENT` (exact/fail). Pass `RESERVE_MODE_AT_MOST` explicitly on custody,
/// confirmation, or recovery paths: there, best-effort is deliberate so a reserve shortfall cannot
/// roll back a custody return or a confirmation. The default exact mode fails the transaction
/// instead of proceeding below the target.
///
/// Unlike `reserveGramsOnBalance(0, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE)`, which only
/// preserves an already-funded pre-message balance, this keeps `max(preMessageBalance, minBalance)`
/// and can top up a rent target from the inbound value. Pass `minBalance = 0` for preserve-only
/// behavior (grams only; the stdlib mode also reserves extra currencies).
fun reserveBalanceBeforeInMessage(
    msgValue: coins,
    minBalance: coins = 0,
    reserveMode: int = RESERVE_MODE_RENT,
): coins {
    val rentDue = contract.getStorageDuePayment();
    val originalBalance = contract.getOriginalBalance();
    val balanceBeforeMessage = originalBalance > msgValue
        ? originalBalance - msgValue
        : 0 as coins;
    val reserve = max(balanceBeforeMessage, minBalance) + rentDue;
    reserveGramsOnBalance(reserve, reserveMode);
    return reserve;
}
