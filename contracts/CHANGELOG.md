# @chainlink/contracts-ton

## 1.6.2

### Patch Changes

- [#738](https://github.com/smartcontractkit/chainlink-ton/pull/738) [`82dc5f0`](https://github.com/smartcontractkit/chainlink-ton/commit/82dc5f0b8de3aaa0a8f944e9f967588a84529ffd) Thanks [@vicentevieytes](https://github.com/vicentevieytes)! - - Reverted value bump on UpdatePrices
  - ReceiveExecutor_Bounced is no longer a bounceable message
  - Supported prev versions for upgrade 1.6.0 and 1.6.1

## 1.6.1

### Patch Changes

- [#717](https://github.com/smartcontractkit/chainlink-ton/pull/717) [`cda7674`](https://github.com/smartcontractkit/chainlink-ton/commit/cda76743963ee1feec992e442b69b0f5afa8cefc) Thanks [@vicentevieytes](https://github.com/vicentevieytes)! - OffRamp rejects min value message. FeeQuoter return excess send mode fix. Increase value for FeeQuoter_UpdatePrices. Propagate error reason on failed messages.

- [#32](https://github.com/smartcontractkit/chainlink-ton/pull/32) [`6ed0b1b`](https://github.com/smartcontractkit/chainlink-ton/commit/6ed0b1b07dfa605288e2aab13ce3caa9945a2c39) Thanks [@krebernisak](https://github.com/krebernisak)! - This is a test changeset (changesets integration added)
