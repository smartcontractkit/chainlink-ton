# BurnMintTokenPool

`link.chain.ton.ccip.pool.BurnMintTokenPool`

> Generated from `build/abi` + `// minval` markers. Do not edit by hand.

| Message | Category | Gate | Summary |
| --- | --- | --- | --- |
| `BurnMintTokenPool_ClaimMinterAdmin` | check-bounce | S | owner-only minter admin claim |
| `CCT_ReturnExcessesBack` | non-reject | none | burn committed; authenticate and complete, no reversal exists; |
| `JettonWithdrawable_Withdraw` | check-bounce | S | owner/fee-admin fee relay; replacement hook owns its funding policy |
| `TokenPool_AddRemotePool` | check-bounce | S | owner-only remote pool config |
| `TokenPool_ApplyChainUpdates` | check-bounce | S | owner-only chain/rate-limit config |
| `TokenPool_ApplyTokenTransferFeeConfigUpdates` | check-bounce | S | TODO: A/dynamic - consider adding a cost function for this operation |
| `TokenPool_Curse` | best-effort | none | RMN admin operation |
| `TokenPool_GetCCVs` | check-bounce | S | read-only CCV query; no custody |
| `TokenPool_GetCCVsAndFees` | check-bounce | S | read-only CCV+fees query; no custody |
| `TokenPool_GetTransferInitiator` | best-effort | none | registry probe; answer from stored config, no value gate |
| `TokenPool_LockOrBurn` | check-admission | A/static | outbound flow; safety plus optional admission |
| `TokenPool_LockOrBurnWithdrawFailed` | recovery | none | authenticated failure callback; recover locally, no gate |
| `TokenPool_PostflightCheckFailed` | recovery | none | async postflight failure; unwinds the flow |
| `TokenPool_PostflightCheckFinished` | check-fail | S | authenticated continuation; recover locally on shortfall |
| `TokenPool_PreflightCheckFailed` | recovery | none | async preflight failure; unwinds the flow |
| `TokenPool_PreflightCheckFinished` | check-fail | S | authenticated continuation; recover locally on shortfall |
| `TokenPool_QueryCCVsReply` | check-fail | S | authenticated query continuation; report failure locally |
| `TokenPool_RMNAccessControlMessage` | check-bounce | S | RMN access-control admin |
| `TokenPool_RMNOwnableMessage` | check-bounce | S | RMN ownership admin |
| `TokenPool_ReleaseOrMint` | check-admission | A/static | inbound flow; safety plus optional admission before capacity consumption |
| `TokenPool_ReleaseOrMintDelivered` | non-reject | none | minval.detail: release committed; authenticate and complete, no reversal exists |
| `TokenPool_RemoveRemotePool` | check-bounce | S | owner-only remote pool config |
| `TokenPool_SetAdvancedPoolHooks` | check-bounce | S | owner-only hooks config |
| `TokenPool_SetAllowedDepositNamespaces` | check-bounce | S | owner-only namespace config |
| `TokenPool_SetAllowedFinalityConfig` | check-bounce | S | owner-only finality config |
| `TokenPool_SetDeployableCode` | check-bounce | S | owner-only deployable code config |
| `TokenPool_SetDynamicConfig` | check-bounce | S | owner-only dynamic config |
| `TokenPool_SetRateLimitConfig` | check-bounce | S | owner/rate-limit-admin config |
| `TokenPool_Uncurse` | best-effort | none | RMN admin operation |
| `TransferNotificationForRecipient` | check-fail | S | authenticated normal custody receipt; shortfall returns custody and refunds eligible capacity |

## Details

- **`JettonWithdrawable_Withdraw`** — TODO: A/dynamic - loops over the withdrawal list; a static S does not bound large inputs
- **`TokenPool_ApplyChainUpdates`** — TODO: A/dynamic - loops removals/additions/remote pools; a static S does not bound large inputs
- **`TokenPool_LockOrBurn`** — Checks the resolved safety floor, then the optional admission threshold, before consuming outbound rate-limit capacity. On shortfall the caller (Router/executor) owns rejection recovery; the pool rejects before any capacity or custody change.
- **`TokenPool_SetRateLimitConfig`** — TODO: A/dynamic - loops over updates; a static S does not bound large inputs
