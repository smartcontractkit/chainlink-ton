---
id: contracts-ccip-offramp-index
title: Offramp
sidebar_label: Overview
sidebar_position: 1
---

# Offramp

The offramp flow covers how validated CCIP messages are received, executed, and surfaced to destination contracts and applications.

## Relationship Diagram

```mermaid
graph LR
	OFR["OffRamp"]
    OCR["OCR Transmitter"]
	MR["MerkleRoot"]
	RE["ReceiveExecutor"]
	R["Router"]
	FQ["FeeQuoter"]
    USER["User"]
    OWNER["Owner"]
    RMN["RMN Router"]
    ROUTER["Router"]
		
        OCR-->|Commit,<br/>Execute| OFR
		USER -->|ManuallyExecute| OFR
		MR -->|ExecuteValidated| OFR
		RE -->|DispatchValidated,<br/>NotifySuccess,<br/>NotifyFailure| OFR
		R -->|CCIPReceiveConfirm,<br/>CCIPReceiveBounced| OFR
		RMN -->|UpdateCursedSubjects| OFR
		OWNER -->|UpdateSourceChainConfigs,<br/>SetDynamicConfig,<br/>UpdateDeployables,<br/>SetOCR3Config,<br/>Upgrade,<br/>Withdraw| OFR

		OFR -->|UpdatePrices| FQ
		OFR -->|Initialize MerkleRoot,<br/>Validate,<br/>MarkState| MR
		OFR -->|Initialize ReceiveExecutor,<br/>InitExecute,<br/>Confirm,<br/>Bounced| RE
		OFR -->|RouteMessage| ROUTER
```

## Topics

- [Arbitrary Message Flow](./arbitrary-msg.md)
- [MerkleRoot](./merkle-root.md)
- [ReceiveExecutor](./receive-executor.md)
- [Token Transfer Flow](./token-transfer.md)

## See also

- [Receiver User Interface](../router/user-interface/receiver.md)
