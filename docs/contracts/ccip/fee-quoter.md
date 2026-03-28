---
id: contracts-ccip-fee-quoter
slug: fee-quoter
title: FeeQuoter
sidebar_label: FeeQuoter
sidebar_position: 4
---

# FeeQuoter

The FeeQuoter is the CCIP pricing contract. It stores destination-chain fee configuration, fee token prices, premium multipliers, and the set of allowed price updaters. On the send path it validates a `CCIPSend` request and replies with either a computed fee or a validation error.

```mermaid
graph LR
    O["Owner"]
    PU["Price Updater"]
    OR["OnRamp / SendExecutor"]
    OFR["OffRamp"]
    FQ["FeeQuoter"]

    O -->|UpdateFeeTokens / UpdateDestChainConfigs| FQ
    O -->|AddPriceUpdater / RemovePriceUpdater| FQ
    PU -->|UpdatePrices| FQ
    OFR -->|UpdatePrices| FQ
    OR -->|GetValidatedFee| FQ
    FQ -->|MessageValidated| OR
    FQ -->|MessageValidationFailed| OR
```

## Responsibilities

- Stores supported fee tokens and their premium multipliers.
- Stores destination-chain fee configuration used to price execution and data availability.
- Stores token prices and enforces staleness limits when computing fees.
- Validates message shape, receiver encoding, gas limits, and chain support before returning a fee.

## Main Flow

```mermaid
sequenceDiagram
    participant OR as OnRamp / SendExecutor
    participant FQ as FeeQuoter

    OR ->> FQ: GetValidatedFee { msg, context }
    Note over FQ: Load fee token prices and dest chain config
    Note over FQ: Validate message payload, receiver, gas limit, and fee token
    alt Fee can be computed
        FQ ->> OR: MessageValidated { fee, msg, context }
    else Validation or pricing fails
        FQ ->> OR: MessageValidationFailed { error, msg, context }
    end
```

The implementation computes the final fee from execution cost, premium fee, and data availability cost, then converts it into the selected fee token before replying.