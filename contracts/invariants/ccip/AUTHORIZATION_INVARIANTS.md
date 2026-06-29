# Authorization Invariants - CCIP on TON

These invariants cover TON-specific authorization properties for CCIP. They
extend the chain-agnostic CCIP authorization invariants maintained in
[chainlink-ccip/chains/evm/contracts/invariants/AUTHORIZATION_INVARIANTS.md](https://github.com/smartcontractkit/chainlink-ccip/tree/main/chains/evm/contracts/invariants/AUTHORIZATION_INVARIANTS.md).

Implementation context: [CCIP-on-TON invariant context](../../../docs/contracts/overview/ccip/invariants.md),
[CCIP overview](../../../docs/contracts/overview/ccip/index.md), and
[Deployable](../../../docs/contracts/overview/deployable.md).

## Invariants

### CCIP-TON-AUTH-1 - Router-Originated OnRamp Messages Are Router-Authorized

Every OnRamp handler that consumes a Router-forwarded CCIP send envelope accepts
that envelope only from the configured Router address.

User-controlled fields inside the envelope remain user-controlled after the
Router sender check.

### CCIP-TON-AUTH-2 - FeeQuoter Replies Are FeeQuoter-Authorized

Every OnRamp or executor handler that consumes fee validation, gas price, or fee
calculation results accepts those results only from the configured FeeQuoter for
the flow.

### CCIP-TON-AUTH-3 - Executor Callbacks Are Deterministically Authorized

Every OnRamp or OffRamp handler that consumes a send-executor or
receive-executor callback accepts the callback only from the deterministic
executor address for the message-specific flow.

The derived executor address accounts for deployable bytecode, target executor
code, owner/trust-root state, namespace, and executor ID.

### CCIP-TON-AUTH-4 - Deterministic Executor Trust Includes Its State Machine

Every privileged executor callback is reachable only from an executor state
machine path initiated by the trusted CCIP contract that owns that executor
flow.

Address derivation proves the executor instance; the executor's own state
machine preserves the callback's trust.

### CCIP-TON-AUTH-5 - OffRamp Report Flows Have Explicit Trusted Counterparties

Every OffRamp report-processing flow has an explicit trusted counterparty for
each protocol stage, including commit roots, execution reports, RMN results,
MerkleRoot callbacks, Router callbacks, and ReceiveExecutor callbacks.

Each stage accepts input only from its configured contract or
deterministically derived executor, according to the protocol trust model.

### CCIP-TON-AUTH-6 - Cross-Contract Trust Roots Are Explicit

Every CCIP contract stores, derives, or receives through authorized
configuration the counterparties it trusts for Router, OnRamp, OffRamp,
FeeQuoter, MerkleRoot, TokenRegistry, send executor, receive executor, receiver,
MCMS, Timelock, and deployable-helper flows.

### CCIP-TON-AUTH-7 - Bounce Effects Match The Original CCIP Flow

Every bounced CCIP message that causes a failure event, retry marker, refund, or
state transition is correlated to the original outbound CCIP message type,
message ID, executor ID, and expected destination contract before the effect
occurs.

### CCIP-TON-AUTH-8 - Upgrade Paths Preserve Authorized Trust Relationships

Every CCIP contract upgrade is authorized by the configured upgrade authority,
rejects unsupported source versions, and preserves or explicitly migrates the
contract's trusted configuration, including Router, OnRamp, OffRamp,
FeeQuoter, MerkleRoot, TokenRegistry, executor code, deployable code, MCMS, and
Timelock state.

An upgrade cannot implicitly weaken or replace the configured trust
relationships; any change to trusted counterparties occurs only through the
authorized configuration or migration process.
