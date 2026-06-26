# Authorization Invariants - TON

> **Base invariants**: [chainlink-ccip/chains/evm/contracts/invariants/AUTHORIZATION_INVARIANTS.md](https://github.com/smartcontractkit/chainlink-ccip/tree/main/chains/evm/contracts/invariants/AUTHORIZATION_INVARIANTS.md)
> applies at the CCIP protocol level. This file documents TON-specific
> authorization categories and review expectations.

## TON Authorization Model

TON contracts receive internal messages and authorize privileged behavior by
checking `in.senderAddress` against the expected address or authority before any
state-changing operation. Any handler that can mutate persistent state, update
configuration, upgrade code, send more value than the inbound message can fund,
or advance an async state machine must have an explicit authorization rule.

If a handler is intentionally open to any caller, the contract code must document
that intent with a standardized comment:

```tolk
// PERMISSIONLESS: <reason this message is safe for any sender>
```

The comment should explain what protects the operation if caller identity does
not. Examples include validation by signed data, validation by message content,
bounded economic cost, or the fact that the call only returns information and
does not mutate privileged state.

## Sender Check Patterns

TON CCIP uses two main sender authorization patterns:

1. Compare `in.senderAddress` to an authorized address stored in contract state
   or configuration. Examples include owner, admin, Router, FeeQuoter, MerkleRoot,
   TokenRegistry, and configured remote/trusted contracts.
2. Derive the expected sender address from trusted code and reconstructed initial
   state, then compare the derived address to `in.senderAddress`. This is used
   when the authorized senders are unbounded and cannot be stored as a list.

For example, OnRamp can authorize callbacks from SendExecutors without storing
every SendExecutor address. OnRamp stores the code used to deploy SendExecutors.
When a SendExecutor callback arrives, OnRamp reconstructs the expected initial
state from trusted contract state and message fields, including OnRamp as the
SendExecutor owner, derives the expected SendExecutor address from that code and
state, and accepts the message only if the derived address equals
`in.senderAddress`. The derived address proves that the sender is the expected
SendExecutor instance. Trust in the callback then comes from the SendExecutor
logic: it should only be able to reach the state that sends that privileged
callback through a path initiated by a trusted contract, such as OnRamp itself.

In many of these flows, the final contract is not deployed directly. TON CCIP
uses the deployable helper under `contracts/contracts/lib/deployable`, whose
bytecode is pinned and intended to be static and immutable. Address derivation
and sender authorization must account for that deployable layer as well as the
target contract code and initial state.

## TON Value-Sending Model

Every internal message sent on TON carries value, but value forwarding is not
automatically privileged. A permissionless handler can safely send value without
draining contract balance in three common patterns:
- Check that `in.valueCoins` covers a fixed outbound `value` plus benchmarked gas
  fees, then send with `SEND_MODE_NORMAL`. The benchmark must account for the
  largest supported message size.
- Create the outbound message with `value: 0` and send it with
  `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE`, which forwards only the inbound
  message value left after gas fees.
- Call `reserveToncoinsOnBalance(reservedValue, RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE)`
  before sending with `SEND_MODE_CARRY_ALL_BALANCE`, which reserves the original
  contract balance and sends only the excess balance.

When `reservedValue > 0`, the handler may also send additional messages with
`SEND_MODE_NORMAL` and `value`s that sum to `reservedValue`. This keeps outgoing value bounded
by the reserved amount plus excess balance while preserving the original
contract balance for future gas.

`SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE` can only be used once in a
transaction; a second send with the same mode in the same transaction will fail
because there is no remaining message value to carry.

A handler becomes value-privileged when it can send more TON than these bounded
patterns allow. Review should flag explicit nonzero `value` sends that are not
covered by an inbound-value check or a prior balance reservation, and any
`SEND_MODE_CARRY_ALL_BALANCE` use without a prior reservation.

## Invariant Categories

### TON-AUTH-1 - Privileged Messages Validate Sender

Every privileged internal message handler must validate `in.senderAddress`
before executing privileged logic.

Privileged behavior includes:
- calling `store()` or otherwise reaching `contract.setData()`
- updating owner-controlled or admin-controlled configuration, including
  executor/deployable code configuration
- updating allowlists or trusted remote contract addresses
- sending more TON value than the inbound message can fund
- withdrawing or forwarding fee tokens
- accepting reports, roots, or execution callbacks that advance message state
- upgrading code through `Upgradeable_Upgrade`

Expected sender checks include direct equality checks, `Ownable2Step.requireOwner`,
configured admin checks, configured contract checks, or deterministic address
derivation checks for autodeployed executors and deployable helpers.

### TON-AUTH-2 - Permissionless Handlers Are Explicitly Marked

Handlers that intentionally allow any sender must be marked with
`// PERMISSIONLESS: <reason>`.

The reason must be specific enough for human and LLM-based review to distinguish
intentional openness from a missing sender check. A generic comment such as
`// permissionless` is not sufficient.

### TON-AUTH-3 - Async Replies Are Bound To Trusted Senders

TON CCIP uses async internal messages for request/reply flows. A reply handler
must validate that the reply came from the expected contract for that flow before
using the message contents.

Examples of trust boundaries to document and verify include:
- OnRamp accepting fee validation replies only from the configured FeeQuoter
- OnRamp accepting executor callbacks only from the deterministic send executor
  address derived from trusted executor code and reconstructed initial state
- OffRamp accepting validation or execution callbacks only from the configured
  MerkleRoot, Router, ReceiveExecutor, or RMN-related address for that flow
- executors accepting callbacks only from contracts they queried or invoked

### TON-AUTH-4 - Async Message Correlation Is Not Caller-Controlled

Async handlers must not rely only on user-controlled body fields to identify an
in-flight operation. If the handler advances state, refunds value, emits a final
event, or triggers a follow-up call, the message must be correlated with trusted
state, deterministic address derivation, an expected sender, or a message ID /
executor ID that cannot be spoofed by an arbitrary caller.

### TON-AUTH-5 - Bounce Handling Validates Origin And Context

Bounce handlers must parse the bounced message safely and validate that the
bounce corresponds to a message the contract was allowed to send. Handling a
bounce must not let an arbitrary sender cause refunds, state transitions, retry
state, or failure events for unrelated messages.

Expected review areas include:
- use of rich bounce bodies and bounced-message prefixes
- validation of `in.senderAddress` against the originally targeted contract
- validation of message IDs, executor IDs, or deployable addresses
- behavior for unexpected, malformed, or unsupported bounced messages

### TON-AUTH-6 - Upgrades Are Owner-Authorized

Every `Upgradeable_Upgrade` entrypoint must require the configured owner before
calling upgrade logic. Migration logic must only be reachable through an
authorized upgrade path and must reject unsupported source versions.

Review should verify:
- `Upgradeable_Upgrade` match arms require authorization before dispatching
- `Ownable2Step.requireOwner(in.senderAddress)` or equivalent protection
- calls to `onUpgrade` are only reachable through the authorized upgrade path
- the new code path runs migration only after authorization
- version compatibility checks are explicit
- low-level upgrade operations such as `setCodePostponed`, dynamic code loading,
  and `contract.setData` are only reached after authorization
- upgrade-related events cannot be emitted by unauthorized callers

### TON-AUTH-7 - Cross-Contract Trust Assumptions Are Explicit

Each contract must make its trusted counterparties clear in storage, dynamic
configuration, or deterministic address derivation logic. Calls that trust
another contract's response must check that the response sender matches that
trust root.

Important trust relationships include Router, OnRamp, OffRamp, FeeQuoter,
MerkleRoot, TokenRegistry, send executors, receive executors, receiver
contracts, MCMS, Timelock, and deployable helpers.

### TON-AUTH-8 - Authorization Precedes State Mutation

State-changing handlers must perform sender validation before mutating in-memory
storage that may later be persisted. A handler should not partially update state
and then perform an authorization check.

Review should trace all paths to `store()` and `contract.setData()` and confirm
that authorization happens before any privileged state transition.
