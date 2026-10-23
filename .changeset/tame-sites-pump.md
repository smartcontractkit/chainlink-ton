---
"@chainlink/contracts-ton": patch
---

FeeQuoter extra args normalization and canonical snake validation

- `GetValidatedFee` now returns the CCIPSend message with normalized, validated extra args instead of echoing the caller's input cell.
- Message data, SUI receiver object IDs, and SVM accounts must be canonical snakes: no exotic/branched cells and no elements straddling cell boundaries.
- An absent EVM gas limit resolves to the destination default before the `maxPerMsgGasLimit` check; SVM `accountIsWritableBitmap` is validated against the account list.
- `tokenAmounts` is asserted to be a plain (non-exotic) empty cell.
- New error codes `InvalidExtraArgsData` and `InvalidSVMExtraArgsWritableBitmap`; corrected `TooManySVMExtraArgsAccounts`.