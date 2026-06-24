---
id: contracts-overview-wgram-gas-report
title: Gas Report
sidebar_label: Gas Report
sidebar_position: 2
---

# wGRAM - Gas Reporter And Fee Constants

The fee guards in `fees-management.tolk` must stay aligned with the measured live paths covered by [tests/gas-report/wgram/wgram.spec.ts](../../../../contracts/tests/gas-report/wgram/wgram.spec.ts).

From [contracts/package.json](../../../../contracts/package.json), run the dedicated reporter from the `contracts` workspace:

```sh
cd chainlink-ton/contracts
yarn wgram-gas-report
```

This suite measures the worst covered execution branches and compares them against the constants in [contracts/contracts/wgram/fees-management.tolk](../../../../contracts/contracts/wgram/fees-management.tolk):

- `GAS_CONSUMPTION_JettonTransfer`
- `GAS_CONSUMPTION_JettonReceive`
- `GAS_CONSUMPTION_BurnRequest`
- `GAS_CONSUMPTION_BurnNotification`
- `MESSAGE_SIZE_BurnNotification_*`
- `MESSAGE_SIZE_ReturnExcesses_*`

When the reporter fails after a contract-path change:

1. Re-run `yarn wgram-gas-report` and read the measured values printed by the failing test.
2. Update the matching constants in [contracts/contracts/wgram/fees-management.tolk](../../../../contracts/contracts/wgram/fees-management.tolk).
3. Re-run `yarn wgram-gas-report` until the measured values and configured constants match exactly.

Only update these constants after an intentional logic change on a covered path. If the numbers drift unexpectedly, treat that as a behavior change to review first, not just a docs-only constant refresh.
