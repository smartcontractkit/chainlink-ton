# Value-budget spec (generated)

> Generated from `build/abi` + `// minval` markers. Do not edit by hand.

Coverage: **118/240** messages classified across 16 contracts.

| Contract | Status | Messages | Classified | Missing |
| --- | --- | ---: | ---: | ---: |
| [BurnMintTokenPool](./BurnMintTokenPool.md) | adopted | 30 | 30 | 0 |
| [CCIPSendExecutor](./CCIPSendExecutor.md) | excluded | 10 | 0 | 10 |
| [DepositAccount](./DepositAccount.md) | excluded | 4 | 1 | 3 |
| [FeeQuoter](./FeeQuoter.md) | excluded | 11 | 0 | 11 |
| [JettonLockBox](./JettonLockBox.md) | adopted | 3 | 3 | 0 |
| [LockReleaseLockboxTokenPool](./LockReleaseLockboxTokenPool.md) | adopted | 32 | 32 | 0 |
| [MCMS](./MCMS.md) | adopted | 10 | 10 | 0 |
| [MerkleRoot](./MerkleRoot.md) | excluded | 2 | 0 | 2 |
| [OffRamp](./OffRamp.md) | excluded | 20 | 0 | 20 |
| [OnRamp](./OnRamp.md) | excluded | 16 | 0 | 16 |
| [ReceiveExecutor](./ReceiveExecutor.md) | excluded | 9 | 0 | 9 |
| [Router](./Router.md) | excluded | 29 | 1 | 28 |
| [Timelock](./Timelock.md) | adopted | 14 | 14 | 0 |
| [TokenAdminRegistry](./TokenAdminRegistry.md) | excluded | 17 | 0 | 17 |
| [TokenAdminRegistryEntry](./TokenAdminRegistryEntry.md) | excluded | 6 | 0 | 6 |
| [TokenPool](./TokenPool.md) | adopted | 27 | 27 | 0 |

## Categories

| Category | Count |
| --- | ---: |
| best-effort | 22 |
| check-admission | 15 |
| check-bounce | 48 |
| check-fail | 14 |
| non-reject | 8 |
| recovery | 11 |

## Notes

- An unqualified marker is a shared default; `<Contract>.<Message>` takes precedence.
  Add a qualified marker when a contract needs a different category than the shared default.
- Admission gates are annotated `A/static` or `A/dynamic`.
- `excluded` contracts are not yet adopted: missing markers there are tolerated by the check.
- This is a coverage and consistency check, not a semantic proof of funding.
