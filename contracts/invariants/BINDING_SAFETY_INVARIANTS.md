# Binding Safety Invariants - TON

These invariants apply to TON contract ABI surfaces regardless of product.
CCIP-specific binding invariants live in
[ccip/BINDING_SAFETY_INVARIANTS.md](ccip/BINDING_SAFETY_INVARIANTS.md).

Implementation context: [TON contract invariant context](../../docs/contracts/invariants.md).

## Invariants

### TON-BIND-1 - Opcodes Are Consistent Across ABI Surfaces

Every Tolk message opcode has the same numeric value in generated TypeScript
wrappers, handwritten Go bindings, and any product codec that serializes or
parses the message.

CRC32-derived Tolk opcodes match the struct name unless a colocated
`nolint:opcode` comment records an intentional compatibility exception.

### TON-BIND-2 - Positional Field Layout Is Identical

Every message, storage struct, event, report, and getter result is encoded with
the same positional field order across Tolk, generated TypeScript wrappers, Go
bindings, and Go codecs.

Field names do not determine compatibility; TON cell encoding compatibility is
positional.

### TON-BIND-3 - Cell Shape Is Identical

Every ABI field has the same cell shape across all encoders and decoders:
inline bits, references, `Maybe` values, dictionaries, snaked cells, linked
lists, and remaining bits/refs are represented identically.

Nil, empty, absent, and `addr_none` values preserve their contract-level
semantics across languages.

### TON-BIND-4 - Serialized Integer Domains Are Preserved

Every integer serialized into storage, an outbound message, an event, or a
getter result fits the destination width and signedness before serialization.

Runtime integer casts do not change TVM stack representation; the invariant
concerns serialization boundaries where values become typed bits.

### TON-BIND-5 - Canonical Encodings Are Stable

Every value that is signed, hashed, committed, compared, or used as a key has a
single canonical cell or BOC encoding across Tolk, TypeScript, Go bindings, and
Go codecs.

### TON-BIND-6 - Address Types Remain Distinct

TON addresses, cross-chain addresses, fixed-width IDs, roots, proofs, and
external-chain byte strings remain distinct at every serialization boundary.

Empty, malformed, all-zero, and `addr_none` encodings are accepted only where the
contract semantic type permits them.

### TON-BIND-7 - Getter Decoding Matches Stack Shape

Every getter reader decodes the exact stack width, tuple nesting, dictionary
encoding, and optional-value convention returned by the Tolk getter.

### TON-BIND-8 - ABI Changes Update Every Binding Surface

Every change to a Tolk message, storage struct, event, getter result, report, or
codec-facing type is reflected in all generated and handwritten binding surfaces
before the change is complete.
