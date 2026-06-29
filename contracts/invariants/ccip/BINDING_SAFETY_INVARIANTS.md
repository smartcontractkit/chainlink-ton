# Binding Safety Invariants - CCIP on TON

These invariants cover TON-specific CCIP ABI compatibility across Tolk
contracts, generated TypeScript wrappers, handwritten Go bindings, and Go CCIP
codecs. They extend the product-agnostic TON binding invariants in
[../BINDING_SAFETY_INVARIANTS.md](../BINDING_SAFETY_INVARIANTS.md).

Implementation context: [CCIP-on-TON invariant context](../../../docs/contracts/overview/ccip/invariants.md)
and [CCIP overview](../../../docs/contracts/overview/ccip/index.md).

## Invariants

### CCIP-TON-BIND-1 - Commit And Execute Reports Encode Identically

Every commit report and execute report field has identical order, width,
signedness, optionality, reference shape, dictionary shape, and canonical cell
encoding in Tolk, Go bindings, Go codecs, and generated TypeScript wrappers.

### CCIP-TON-BIND-2 - Message Hash Inputs Are Canonical

Every CCIP message hash input is encoded canonically and identically across the
contract, Go codecs, relayer code, and generated wrappers.

This includes message IDs, source and destination selectors, sequence numbers,
sender and receiver addresses, token amounts, extra args, gas limits, and
payload cells.

### CCIP-TON-BIND-3 - Cross-Chain Addresses Preserve Their Semantic Type

Every CCIP address crossing the TON ABI preserves whether it is a TON address,
an external-chain address, a CCIP encoded cross-chain address, a fixed-width
message ID, or another fixed-width byte value.

Length prefixes, `addr_none`, empty values, malformed values, and all-zero
values retain the contract semantics for that address type.

### CCIP-TON-BIND-4 - Extra Args And Token Data Are Bounded

Every CCIP extra-args payload, token-data payload, receiver payload, and
user-controlled arbitrary message payload is encoded with explicit boundaries
that prevent it from consuming or shifting trusted fields appended by Router,
OnRamp, OffRamp, or executor contracts.

### CCIP-TON-BIND-5 - Events Preserve CCIP Indexing Semantics

Every CCIP event or external log body has identical opcode, field order, cell
shape, and canonical encoding across Tolk emitters, Go event readers, generated
wrappers, and any relayer or log-poller parser.
