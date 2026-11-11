---
id: contracts-ccip-offramp-token-transfer
title: Token Transfer Offramp Flow
sidebar_label: Token Transfer
sidebar_position: 5
---

# Token Transfer Offramp Flow

> Before you read, see [Jetton Transfer Notation Convention](../../token-transfer-notation-convention.md): a dotted arrow is a jetton transfer.

> See also the [Arbitrary Message Flow](./arbitrary-msg.md), which this flow continues once the tokens are delivered, and [how the Token Registry is implemented](../token-pools/token-registry.md).

A message carries at most one token transfer. The tokens are released or minted by the token's pool into the receiver's **deposit account** for that token (owned by the Router), and the ReceiveExecutor only continues with the message once the deposit account reports the delivery.

```mermaid
graph LR
    OFR["OffRamp"]
    MR["MerkleRoot"]
    RE["ReceiveExecutor"]
    TAR["TokenAdminRegistry"]
    R["Router"]
    DA["Deposit Account<br/>(receiver, token)"]
    TP["Token Pool"]

    OFR -->|1. Validate| MR
    MR -->|2. ExecuteValidated| OFR
    OFR -->|3. InitExecute| RE
    RE -->|4. GetTokenInfo| TAR
    TAR -->|5. TokenInfo| RE
    RE -->|6. ReleaseOrMint| OFR
    OFR -->|7. RelayReleaseOrMint| R
    R -->|8. Init| DA
    DA -->|9. Initialized| R
    R -->|10. ReleaseOrMint| TP
    TP -.->|11. Transfer T| DA
    DA -->|12. ForwardNotification| RE
    RE -->|13. TokenTransferDelivered,<br/>DispatchValidated| OFR
```

## Release or Mint

```mermaid
sequenceDiagram
    participant OR as OffRamp
    participant MR as MerkleRoot{id}

    Note over OR: RECEIVES Execute / ManuallyExecute
    activate OR
    Note over OR: Verifies the TokenAdminRegistry is configured
    Note over OR: Verifies offchainTokenData has one empty entry<br>per token transfer, and extraData is bounded
    Note over OR: Parses OffRamp_ExecutionContext: one effective<br>destGasAmount per token transfer (manual overrides<br>must match the transfer count and not be lower)
    Note over OR: Verifies the value covers the execution,<br>gasLimit and destGasAmount
    OR ->> MR: Validate { message, metadataHash,<br>isManualExecution, context, excessesTo }
    deactivate OR

    activate MR
    Note over MR: See Arbitrary Message Flow
    MR ->> OR: ExecuteValidated { message, deployExecutor,<br>context, excessesTo }
    deactivate MR

    activate OR
    Note over OR: emits: ExecutionStateChanged { state: InProgress }
    alt More than one token transfer
    Note over OR: Throws UnsupportedNumberOfTokens
    OR -x MR: ExecuteValidated bounces
    Note over MR: Marks the message Failure and keeps the<br>executor deploy pending (see Rejected Executions<br>in the Arbitrary Message Flow)
    end
    Note over OR: One token transfer: builds the token transfer<br>{ tokenAdminRegistry, receiverAccount,<br>transfer with the effective destGasAmount }
    create participant RE as ReceiveExecutor{id}
    OR ->> RE: Deployable_Initialize (when deployExecutor)<br>then InitExecute { ..., tokenTransfer }
    deactivate OR

    participant TAR as TokenAdminRegistry
    participant R as Router
    participant DA as Deposit Account
    participant TP as Token Pool

    activate RE
    Note over RE: Verifies the value covers gasLimit,<br>destGasAmount and the execution
    RE ->> TAR: GetTokenInfo { token }
    deactivate RE
    TAR ->> RE: TokenInfo { poolInfo }

    activate RE
    Note over RE: Verifies the token is enabled and destGasAmount<br>covers the pool's release admission
    RE ->> OR: ReleaseOrMint { execId, tokenPool,<br>destGasAmount, request }
    deactivate RE

    activate OR
    Note over OR: Verifies sender is the ReceiveExecutor
    Note over OR: Verifies destGasAmount >= minTTGasLimit
    OR ->> R: RelayReleaseOrMint { tokenPool, request,<br>replyTo: ReceiveExecutor }
    deactivate OR

    activate R
    Note over R: Verifies sender is the OffRamp
    R ->> DA: Deployable_Initialize (idempotent)<br>then DepositAccount_Init
    deactivate R
    Note over DA: First init: learns its jetton wallet
    DA ->> R: DepositAccount_Initialized

    activate R
    R ->> TP: ReleaseOrMint { request, delivery: { recipient:<br>deposit account, forwardPayload: Notify ReceiveExecutor },<br>replyTo: ReceiveExecutor }
    deactivate R

    activate TP
    Note over TP: Verifies sender is the Router<br>and applies the rate limit
    TP -->> DA: Transfer T { amount,<br>fwdPayload: Notify ReceiveExecutor }
    deactivate TP

    DA ->> RE: ForwardNotification { notification }

    activate RE
    Note over RE: Verifies sender is the receiver's deposit account<br>and the transfer initiator is the pool's
    Note over RE: Token transfer state: Success
    alt No data and gasLimit == 0 (pure token transfer)
    RE ->> OR: NotifySuccess { messageRef, execId, root,<br>delivered, excesses }
    else Message has data or gasLimit
    RE ->> OR: TokenTransferDelivered { execId, delivered }
    RE ->> OR: DispatchValidated { message, execId,<br>effectiveGasLimit, tokenAmounts }
    Note over OR: Continues as the Arbitrary Message Flow
    end
    deactivate RE
```

## Delivery Report

Once the deposit account reports the delivery, the OffRamp relays it to the pool, which emits `ReleasedOrMinted`. The report is independent of the message execution: the receiver may never confirm, but the tokens are already in its deposit account.

```mermaid
sequenceDiagram
    participant RE as ReceiveExecutor{id}
    participant OR as OffRamp
    participant R as Router
    participant TP as Token Pool

    RE ->> OR: TokenTransferDelivered / NotifySuccess { delivered }
    OR ->> R: TokenTransferDelivered { tokenPool, transfer,<br>replyTo: ReceiveExecutor }
    R ->> TP: ReleaseOrMintDelivered { transfer, replyTo }
    Note over TP: emits ReleasedOrMinted
    TP ->> RE: ReleaseOrMintFinalized
    RE ->> OR: remaining value
```

A pure token transfer (no data, `gasLimit == 0`) ends here: the OffRamp sends `MarkState(Success)` to the MerkleRoot, which answers with `ExecutionStateChanged`, and the OffRamp emits the event and refunds the caller (see [Receive Confirmation Flow](./arbitrary-msg.md#receive-confirmation-flow)). A message with data or gas is finalized by the receiver's confirmation or bounce, as an arbitrary message.

## Failure Paths

Every failure on the token path ends the execution with `NotifyFailure`, which the OffRamp turns into `MarkState(Failure)`. The token transfer state records the failed step, so a manual retry resumes from there.

| Failure                                                          | Detected by                                         | Reported as                                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| More than one token transfer                                     | OffRamp, `ExecuteValidated`                         | transaction fails with `UnsupportedNumberOfTokens`; the bounce marks the message `Failure` with the executor deploy pending |
| Not enough value for gasLimit and destGasAmount                  | ReceiveExecutor, `InitExecute`                      | `NotifyFailure` (state unchanged)                                                                                           |
| Token not enabled, or destGasAmount below the pool's admission   | ReceiveExecutor, `TokenInfo` / `GetTokenInfoFailed` | `NotifyFailure`, token state `TokenAdminRegistryQueryFailed`                                                                |
| TokenAdminRegistry query bounced                                 | ReceiveExecutor                                     | `NotifyFailure`, token state `TokenAdminRegistryQueryFailed`                                                                |
| destGasAmount below `minTTGasLimit`                              | OffRamp, `ReleaseOrMint`                            | `ReceiveExecutor_ReleaseOrMintFailed`, then `NotifyFailure`                                                                 |
| Lane cursed, pool bounced the relay, deposit account init failed | Router                                              | `Router_TokenPoolReleaseOrMintFailed` to the OffRamp, then `ReceiveExecutor_ReleaseOrMintFailed`, then `NotifyFailure`      |
| Pool rejected the release (e.g. rate limit)                      | Token Pool                                          | `TokenPool_ReleaseOrMintFailure` to the ReceiveExecutor, then `NotifyFailure`                                               |

A retry after a release-or-mint failure queries the TokenAdminRegistry again, so a pool re-pointed since the failed attempt is used. A retry after the tokens were delivered skips straight to the message execution.
