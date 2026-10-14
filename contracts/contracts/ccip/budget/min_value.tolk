// SPDX-License-Identifier: BUSL-1.1
import "../../lib/budget/min_value"
import "../../lib/budget/gas"

/// Initial CCIP budgets; calibration against success and recovery traces is still required.

/// Global CCIP safety allowance for a checked handler (~0.1 TON at 400 nanotons/gas).
const CCIP_MIN_VALUE_GAS_UNITS: int = BUDGET_UNITS_LVL3_HIGH;
const CCIP_MIN_VALUE_BUFFER: int = 1;

/// Default flow-admission threshold for a token pool (~0.25 TON at 400 nanotons/gas).
const CCIP_ADMISSION_GAS_UNITS: int = BUDGET_UNITS_LVL4_XHIGH;
const CCIP_ADMISSION_BUFFER: int = 1;

fun ccipMinValue(): coins {
    return calculateMinValue(CCIP_MIN_VALUE_GAS_UNITS, CCIP_MIN_VALUE_BUFFER);
}

fun ccipAdmissionValue(): coins {
    return calculateMinValue(CCIP_ADMISSION_GAS_UNITS, CCIP_ADMISSION_BUFFER);
}
