# Timelock

`link.chain.ton.mcms.Timelock`

> Generated from `build/abi` + `// minval` markers. Do not edit by hand.

| Message | Category | Gate | Summary |
| --- | --- | --- | --- |
| `AccessControl_GrantRole` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `AccessControl_RenounceRole` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `AccessControl_RevokeRole` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `Timelock_BlockFunctionSelector` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `Timelock_BypasserExecuteBatch` | check-admission | A/dynamic | size-scaled (per-call fees + reply); rejects on shortfall |
| `Timelock_Cancel` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `Timelock_ExecuteBatch` | check-admission | A/dynamic | size-scaled (per-call event fees + reply); rejects on shortfall |
| `Timelock_Init` | check-admission | A/static | must cover the init cost and rent reserve; rejects on shortfall |
| `Timelock_ScheduleBatch` | check-admission | A/dynamic | size-scaled (per-call event fees + reply); rejects on shortfall |
| `Timelock_SubmitErrorReport` | check-admission | A/static | must cover the error-report cost; rejects on shortfall |
| `Timelock_UnblockFunctionSelector` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `Timelock_UpdateDelay` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `Timelock_UpdateExecutorRoleCheck` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `Timelock_UpdateOpFinalizationTimeout` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
