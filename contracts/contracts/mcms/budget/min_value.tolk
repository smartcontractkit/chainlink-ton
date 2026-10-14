// SPDX-License-Identifier: BUSL-1.1
import "../../lib/budget/min_value"
import "../../lib/budget/gas"

/// MCMS min-value floors. Gas units are set from tests/budget/mcms.

/// Flows that can unwind state: the measured worst-case rollback budget × safety multiple.
const MCMS_MIN_VALUE_GAS_UNITS: int = BUDGET_UNITS_LVL0_MIN; // ≈0.012 TON
const MCMS_MIN_VALUE_BUFFER: int = 5;

/// Admin/config/query/continuation handlers: default message budget × small multiple.
const MCMS_ADMIN_MIN_VALUE_GAS_UNITS: int = BUDGET_UNITS_LVL0_MIN;
const MCMS_ADMIN_MIN_VALUE_BUFFER: int = 2;

fun mcmsMinValue(): coins {
    return calculateMinValue(MCMS_MIN_VALUE_GAS_UNITS, MCMS_MIN_VALUE_BUFFER);
}

fun mcmsAdminMinValue(): coins {
    return calculateMinValue(MCMS_ADMIN_MIN_VALUE_GAS_UNITS, MCMS_ADMIN_MIN_VALUE_BUFFER);
}
