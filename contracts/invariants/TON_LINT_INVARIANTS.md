# TON Lint Invariants

These invariants define TON/Tolk properties that static analysis and review
preserve. They are not a list of new Acton rules.

Implementation context: [TON contract invariant context](../../docs/contracts/invariants.md).

Current tooling boundaries:

- `contracts/Acton.toml` configures Acton. `unauthorized-access` (`E013`) is
  configured as `deny` and already covers storage mutations reachable without a
  preceding admin sender check.
- `scripts/oplint` checks only that Tolk struct opcodes match CRC32 struct-name
  values, except documented `nolint:opcode` cases.

## Invariants

### TON-LINT-1 - Permissionless Entry Points Are Declared

Every handler reachable by an arbitrary sender has a nearby `PERMISSIONLESS`
annotation explaining why caller identity is not required.

```tolk
// PERMISSIONLESS: <reason this message is safe for any sender>
```

### TON-LINT-2 - Authorized Entry Points Are Declared

Every sender-authorized handler has a nearby `AUTHORIZED` annotation identifying
the authorized sender or trust root and the check mechanism.

```tolk
// AUTHORIZED: <authorized sender or trust root>; check=<authorization mechanism>
```

### TON-LINT-3 - Serialization Casts Preserve Value Domains

Every integer cast whose result is serialized into storage, an outbound message,
an event, or a getter result preserves the semantic domain of the source value.

Values outside the destination width or signedness are rejected before the typed
serialization boundary.

### TON-LINT-4 - User-Controlled Parsing Is Bounded

Every user-controlled slice, cell, dictionary, and remaining-bits/refs payload is
fully bounded and validated before trusted fields are appended, interpreted,
stored, emitted, or forwarded.

Trusted envelopes do not make embedded user-controlled fields trusted.

### TON-LINT-5 - Lazy Decoding Cannot Shift Trusted Fields

Every decode of a union, nested cell, or fallback message body preserves the
intended field boundary between user-controlled data and trusted contract-added
data.

Unexpected opcodes, extra bits, extra refs, empty bodies, and malformed bounced
bodies resolve to the intended error path.

### TON-LINT-6 - Bounce Effects Are Correlated

Every bounce-driven state update, retry marker, refund, or failure event is
correlated to the expected outbound message type and flow before the effect
occurs.

### TON-LINT-7 - Privileged Mutation Ordering Is Stable

Every privileged mutation that can be persisted is ordered after authorization,
message parsing, and precondition checks on successful paths.

### TON-LINT-8 - Deterministic Address Derivation Is Complete

Every deterministic-address check includes all trusted code, deployable wrapper
data, owner/configuration values, namespace values, and message-specific IDs
that define the authorized address.

### TON-LINT-9 - Non-CRC Opcodes Are Documented

Every opcode that does not match the CRC32 value of its Tolk struct name has a
nearby `nolint:opcode` comment that identifies the compatibility reason.

### TON-LINT-10 - Retry And Replay State Is Monotonic

Every retry, replay, failure, refund, and execution lifecycle state transition
preserves message uniqueness and prevents the same message from being executed
or finalized outside its intended lifecycle.
