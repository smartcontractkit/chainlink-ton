# MCMS

`link.chain.ton.mcms.MCMS`

> Generated from `build/abi` + `// minval` markers. Do not edit by hand.

| Message | Category | Gate | Summary |
| --- | --- | --- | --- |
| `MCMS_CleanExpiredRoots` | best-effort | none | TODO: no value gate; loops over roots; add a safety check |
| `MCMS_ConfigSet` | non-reject | none | noop reply to our own config set; nothing to finalize |
| `MCMS_Execute` | check-admission | A/dynamic | covers the execute cost and the op.value floor; fans out to the target |
| `MCMS_ExpiredRootsCleaned` | non-reject | none | noop reply to our own roots cleanup; nothing to finalize |
| `MCMS_OracleRoleTransferred` | non-reject | none | noop reply to our own oracle-role transfer; nothing to finalize |
| `MCMS_SetConfig` | check-admission | A/static | must cover the set-config cost; rejects on shortfall |
| `MCMS_SetRoot` | check-admission | A/static | must cover the set-root cost; rejects on shortfall |
| `MCMS_SubmitErrorReport` | check-admission | A/static | must cover the error-report cost; rejects on shortfall |
| `MCMS_TransferOracleRole` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
| `MCMS_UpdateOpFinalizationTimeout` | best-effort | none | the caller's dispatch owns funding; TODO: check-bounce |
