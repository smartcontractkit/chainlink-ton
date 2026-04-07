---
id: contracts-ccip-onramp-index
slug: onramp
title: Onramp
sidebar_label: Overview
sidebar_position: 1
---

# Onramp

The onramp flow covers how CCIP send requests are accepted, stored, and prepared for downstream processing.

## Relationship Diagram

```mermaid
graph LR
    CALLER["Caller"]
	OR["OnRamp"]
	SE["SendExecutor"]
	FQ["FeeQuoter"]
	R["Router"]
    OWNER["Owner"]
    ADM["Allowlist Admin / Owner"]
    ANY["Anyone"]
    AGG["Fee Aggregator"]

    R -->|OnRamp_Send| OR
    OR -->|MessageSent,<br/>MessageRejected| R
    FQ -->|MessageValidated,<br/>MessageValidationFailed| OR
    SE -->|ExecutorFinishedSuccessfully,<br/>ExecutorFinishedWithError| OR
    ADM  -->|UpdateAllowlists| OR
    ANY -->|WithdrawFeeTokens| OR
    OWNER -->|SetDynamicConfig,<br/>UpdateDestChainConfigs,<br/>UpdateSendExecutor,<br/>Upgrade| OR
    CALLER -->|GetValidatedFee| OR
    OR -->|MessageValidated,<br/>MessageValidationFailed| CALLER

    OR -->|GetValidatedFee| FQ
    OR -->|InitializeAndSend| SE
    OR -->|Withdraw| AGG
```

## Topics

- [Arbitrary Message Flow](./arbitrary-msg.md)
- [SendExecutor](./send-executor.md)
- [Token Transfer Flow](./token-transfer.md)

## See also

- [Sender User Interface](../router/user-interface/sender.md)
