# Authorization Invariants - TON

These invariants apply to TON contracts regardless of product. CCIP-specific
authorization invariants live in [ccip/AUTHORIZATION_INVARIANTS.md](ccip/AUTHORIZATION_INVARIANTS.md).

Implementation context: [TON contract invariant context](../../docs/contracts/invariants.md),
[Deployable](../../docs/contracts/overview/deployable.md), and
[Upgradeable](../../docs/contracts/overview/libraries/upgradeable.md).

## Invariants

### TON-AUTH-1 - Privileged Handlers Are Sender-Authorized

Every handler that performs a privileged operation validates `in.senderAddress`
against the governing authority before the privileged operation is reachable.

Privileged operations include:

- Persistent state mutation: owner/admin, configuration changes, trusted-counterparty changes, code upgrades, migration, privileged value transfer, and async state-machine advancement.
- Sending privileged operation messages, such as updating the configuration of an owned contract.
- Sending value that exceeds the inbound message's value or a prior balance reservation that preserves the original balance.

### TON-AUTH-2 - Authorized Handlers Carry A Matching Annotation

Every sender-authorized handler is documented near the match with
an `AUTHORIZED` annotation whose authority and check type match the code path, according to the [Annotation Conventions](../../docs/contracts/invariants.md#annotation-conventions).

### TON-AUTH-3 - Permissionless Handlers Are Explicit And Non-Privileged

Every intentionally permissionless handler is documented near the match arm or
handler with a `PERMISSIONLESS` annotation, according to the [Annotation Conventions](../../docs/contracts/invariants.md#annotation-conventions). Every operation reachable from
that handler is safe for an arbitrary sender

### TON-AUTH-4 - Value-Privileged Sends Are Authorized

Every handler that can send more TON than its inbound message can fund is
sender-authorized before the value send is reachable.

Permissionless handlers that send value preserve this property by the mechanisms described in [TON Value Sending](../../docs/contracts/invariants.md#ton-value-sending).

### TON-AUTH-5 - Async State Transitions Are Bound To Trusted Senders

Every async reply or callback that advances state, releases value, emits a final
event, or triggers a follow-up message is accepted only from the trusted sender
for that flow.

The trusted sender is represented by stored configuration, owner/admin state, or
a deterministic address derived from trusted code and initial state.

### TON-AUTH-6 - Bounced Messages Are Correlated Before Effects

Every bounce handler that changes state, records failure, refunds value, retries
work, or emits a failure event correlates the bounced body to the outbound
message and flow that produced it before the effect occurs.

The invariant concerns interpretation and correlation of TON runtime bounce
data; bounced message contents are runtime-generated, not attacker-forged.

### TON-AUTH-7 - Deterministic Sender Authorization Uses Trusted Init Data

Every deterministic-address sender check derives the expected address from
trusted code, trusted initial state, and the message-specific identifier for the
flow being authorized.

When a deployable helper is part of the address path, the derived address
accounts for the deployable bytecode, target code, owner, namespace, and ID used
to form the init state.

### TON-AUTH-8 - Upgrade Effects Are Owner-Authorized

Every code upgrade, migration, supported-version transition, dynamic code load,
`setCodePostponed`, and upgrade-related state write is reachable only after the
configured upgrade authority has authorized the upgrade message.

Unauthorized callers cannot reach `onUpgrade`, run migration code, update stored
code, or emit upgrade-success events.

### TON-AUTH-9 - Authorization Precedes Privileged Mutation

Every privileged state mutation is ordered after the relevant sender
authorization on all successful paths that persist the mutation.

In-memory mutations that are later persisted by `store()`, `save()`, or
`contract.setData(...)` inherit the same ordering requirement.
