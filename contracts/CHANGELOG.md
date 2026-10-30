# @chainlink/contracts-ton

## 1.6.4

### Patch Changes

- [#841](https://github.com/smartcontractkit/chainlink-ton/pull/841) [`7ba0c36`](https://github.com/smartcontractkit/chainlink-ton/commit/7ba0c36617e08764508fbd1142577e687f063dd1) Thanks [@duck-types](https://github.com/duck-types)! - Breaking change: `Receiver_CCIPReceive` (opcode `0xb3126df1`) was removed in favour of `Receiver_CCIPReceiveV2` (opcode `0x5b4bc7a6`)

## 1.6.3

### Patch Changes

FeeQuoter extra args normalization and canonical snake validation

- `GetValidatedFee` now returns the CCIPSend message with normalized, validated extra args instead of echoing the caller's input cell.
- Message data, SUI receiver object IDs, and SVM accounts must be canonical snakes: no exotic/branched cells and no elements straddling cell boundaries.
- An absent EVM gas limit resolves to the destination default before the `maxPerMsgGasLimit` check; SVM `accountIsWritableBitmap` is validated against the account list.
- `tokenAmounts` is asserted to be a plain (non-exotic) empty cell.
- New error codes `InvalidExtraArgsData` and `InvalidSVMExtraArgsWritableBitmap`; corrected `TooManySVMExtraArgsAccounts`.

## 1.6.2

### Patch Changes

- [#738](https://github.com/smartcontractkit/chainlink-ton/pull/738) [`82dc5f0`](https://github.com/smartcontractkit/chainlink-ton/commit/82dc5f0b8de3aaa0a8f944e9f967588a84529ffd) Thanks [@vicentevieytes](https://github.com/vicentevieytes)! - - Reverted value bump on UpdatePrices
  - ReceiveExecutor_Bounced is no longer a bounceable message
  - Supported prev versions for upgrade 1.6.0 and 1.6.1

## 1.6.1

### Patch Changes

- [#717](https://github.com/smartcontractkit/chainlink-ton/pull/717) [`cda7674`](https://github.com/smartcontractkit/chainlink-ton/commit/cda76743963ee1feec992e442b69b0f5afa8cefc) Thanks [@vicentevieytes](https://github.com/vicentevieytes)! - OffRamp rejects min value message. FeeQuoter return excess send mode fix. Increase value for FeeQuoter_UpdatePrices. Propagate error reason on failed messages.

- [#32](https://github.com/smartcontractkit/chainlink-ton/pull/32) [`6ed0b1b`](https://github.com/smartcontractkit/chainlink-ton/commit/6ed0b1b07dfa605288e2aab13ce3caa9945a2c39) Thanks [@krebernisak](https://github.com/krebernisak)! - This is a test changeset (changesets integration added)
