// SPDX-License-Identifier: BUSL-1.1
import "../../lib/budget/min_value"
import "../../lib/budget/gas"

/// Initial CCIP budgets; calibration against success and recovery traces is still required.

/// Safety budget for operations that may require recovery.
const CCIP_MIN_VALUE_GAS_UNITS: int = BUDGET_UNITS_LVL3_HIGH; // ≈0.100 TON
const CCIP_MIN_VALUE_BUFFER: int = 5;

/// Admin/config/query/continuation handlers (bounceable, no custody): default message budget × small multiple.
const CCIP_ADMIN_MIN_VALUE_GAS_UNITS: int = BUDGET_UNITS_LVL0_MIN; // ≈0.012 TON
const CCIP_ADMIN_MIN_VALUE_BUFFER: int = 2;

fun ccipMinValue(): coins {
    return calculateMinValue(CCIP_MIN_VALUE_GAS_UNITS, CCIP_MIN_VALUE_BUFFER);
}

fun ccipAdminMinValue(): coins {
    return calculateMinValue(CCIP_ADMIN_MIN_VALUE_GAS_UNITS, CCIP_ADMIN_MIN_VALUE_BUFFER);
}
