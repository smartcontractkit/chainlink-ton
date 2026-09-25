# TON CCIP Bindings — Versioning Design

Design reference for keeping multiple interface versions of the same contract available
side by side. Read this before changing anything under a `bindings/` directory.

## Problem

Bindings are generated from the contracts at a point in time and committed. When a contract's
**interface** changes, the old bindings are overwritten, so pipeline inputs (durable-pipeline
YAML, proposal JSON) that were authored against the old interface stop working:

```
message type not found in registry for contract=link.chain.ton.ccip.OnRamp opcode=0x82901c45
```

On EVM a stale ABI usually degrades into a decode error. TON TL-B is a **positional bit layout**,
so decoding/encoding against the wrong version can silently produce a **wrong cell**. Version
selection must therefore be explicit and never inferred from "newest".

Two things are versioned independently and must not be conflated:

| | Changes when | Artifact |
|---|---|---|
| **Code version** | bytecode changes (hotfix, refactor, logic fix) | contract asset / package |
| **Interface version** | message, storage, or event TL-B layout changes | bindings |

A release that changes only bytecode produces **an asset and zero new binding directories**.

## Core model

We **evolve forward** and keep a **historical snapshot only for what changed**.

- `<base>/<contract>/` — the **current** interface. Always the newest. Complete.
- `<base>/v<X_Y_Z>/<contract>/` — a **frozen snapshot** of that contract's interface as it was
  at release `X.Y.Z`. Never edited by hand.

A checkpoint exists **only** for a `(contract, version)` whose interface was later changed. A
contract that never changed has exactly one copy, in the current path, and serves *all* versions.

Snapshots use Go-style path segments (`v1_6_0`), not dots: `v1_6_0`, not `v1.6.0`.

### Naming rule

> A checkpoint directory is named after the release in which that interface **became current**.

For the initial baseline that is `v1_6_0`. If `FeeQuoter` changes at 1.6.2, the *outgoing*
interface became current at 1.6.0, so it is snapshotted as `v1_6_0/feequoter`. If it changes
again at 2.0.0, the outgoing (1.6.2-era) interface goes to `v1_6_2/feequoter`.

This is what keeps the version ranges below free of holes. Naming a checkpoint after the release
in which it was *cut* (e.g. `v1_6_2/router` for a Router that was unchanged from 1.6.0) would
leave `Router@1.6.1` unresolvable.

## Resolution

Each contract resolves independently. Treat the current (unversioned) path as the entry at the
version where that contract's interface last changed, then:

```
resolution = greatest key <= requestedVersion      (error if none)
```

Checkpoint *ranges* are derived, not stored: an entry at V serves `[V, next entry)`.

The registry itself is unchanged: versioning is folded into the existing `ContractTLBRegistry` as
an extra key namespace, so there is exactly one registry type and existing consumers keep working.

```go
registry.Lookup(contract, opcode)                   // unchanged: current interface
registry.LookupVersion(contract, opcode, version)   // greatest version <= requested
registry.ForVersion(version)                        // registry pinned to one version
```

`ForVersion` returns an ordinary `ContractTLBRegistry`, so a version-unaware consumer (such as
`MessageEnvelope.LoadDecoded`) can be pointed at a historical interface with no signature change.

Worked resolution for the example below:

| Request | Result |
|---|---|
| `router@2.0.0` | current path |
| `router@1.6.17` | `v1_6_0/router` |
| `router@1.6.1` | `v1_6_0/router` |
| `feequoter@1.6.1` | `v1_6_0/feequoter` |
| `feequoter@1.6.5` | `v1_6_2/feequoter` |
| `feequoter@1.6.0` | `v1_6_0/feequoter` |

## Manifest

Only **one** fact in this scheme is not derivable from the filesystem: the **version of the
current (unversioned) path**, per contract. Checkpoint versions come from directory names
(`v1_6_0` → `1.6.0`), but the current path has no version in its name. That fact is the
manifest's real content.

It is needed because it bounds the *newest* checkpoint's range. Without it the top checkpoint
absorbs every later request:

| Request | Without a bound | Correct |
|---|---|---|
| `feequoter@2.0.0` | `v1_6_2/feequoter` ❌ | current |
| `feequoter@2.5.0` | `v1_6_2/feequoter` ❌ | current |

So the manifest is simply the interface-change history per contract, small enough to be a
hand-maintained constant. The current path appears as the entry at the version where the
contract's interface last changed — there is no separate `latest` value to keep in sync.

For the worked example below:

```go
// version -> package, for each contract that has ever changed.
// Contracts absent from this map never changed: always resolve to the current path.
var interfaces = map[Contract]map[semver.Version]tvm.TLBMap{
    Router: {
        v(1, 6, 0): routerV160.TLBs, // serves 1.6.0 .. <2.0.0
        v(2, 0, 0): router.TLBs,     // current path
    },
    FeeQuoter: {
        v(1, 6, 0): feequoterV160.TLBs, // serves 1.6.0 .. <1.6.2
        v(1, 6, 2): feequoterV162.TLBs, // serves 1.6.2 .. <2.0.0
        v(2, 0, 0): feequoter.TLBs,     // current path
    },
}
```

### The bound is per contract, not one global value

A contract's current interface corresponds to the release in which *that contract* last
changed, and contracts change in different releases. A separate variant to illustrate — Router
changed at **1.6.2**, FeeQuoter only at **2.0.0**, main at 2.0.0:

- Router's current interface *is* the 1.6.2 one → `router@1.6.5` resolves to the current path.
- FeeQuoter's current interface is the 2.0.0 one → `feequoter@1.6.5` resolves to `v1_6_2/feequoter`.

A single global `latest = 2.0.0` would send `router@1.6.5` to `v1_6_0/router` — the wrong
Router. One global value is therefore not sufficient.

Notes:

- A request older than a contract's first entry is an error — e.g. a contract introduced at
  2.0.0 cannot serve `@1.6.0`.
- Do **not** derive the current version from `contracts-pkg.json`. That tracks the **code**
  version, which bumps on bytecode-only releases; using it would mis-bound the range. A
  bytecode-only `2.0.1` would make `feequoter@2.0.0` resolve to the `v1_6_2` checkpoint instead
  of the current interface.
- Adding a checkpoint is a two-line change: add the entry for the outgoing interface and add
  the new entry for the current path.

## Worked example

Releases: `1.6.0`, `1.6.1` (no interface change), `1.6.2` (FeeQuoter changes), `2.0.0`
(Router and FeeQuoter change).

| Step | Current path | Snapshots added |
|---|---|---|
| 1.6.0 | all interfaces | — |
| 1.6.1 | unchanged | — (no interface change => nothing added) |
| 1.6.2 | FeeQuoter updated | `v1_6_0/feequoter` |
| 2.0.0 | Router + FeeQuoter updated | `v1_6_0/router`, `v1_6_2/feequoter` |

Final tree:

```
bindings/
  router/             # current — the 2.0 interface
  feequoter/          # current — the 2.0 interface
  onramp/ offramp/ …  # current; unchanged contracts live only here
  v1_6_0/
    router/           # Router@1.6.0..<2.0.0
    feequoter/        # FeeQuoter@1.6.0..<1.6.2
  v1_6_2/
    feequoter/        # FeeQuoter@1.6.2..<2.0.0
```

Note `onramp`/`offramp` never changed, so they are not snapshotted and the single current copy
is backwards compatible across 1.6.x and 2.0 — provided the caveat below holds.

### Real case study: `c6655369`

The first application of this design, and the change that motivated it. Commit `c6655369`
("refactor: inline subcontract code dependencies instead of store them") changed the wire format of
**three** contracts at once:

| Contract | Change |
|---|---|
| `onramp` | Removed `OnRamp_UpdateSendExecutor` (`0x82901c45`); restructured storage |
| `offramp` | Changed message and storage layouts |
| `router` | Added a leading `queryId` to `Router_RouteMessage` and `Router_CCIPReceiveConfirm` |

The commit sits **between** the `contracts/1.6.2` tag and the next release, and does not bump the
package version itself (`contracts/package.json` is still `1.6.2` in the commit). The replacement
landed as **1.6.3** — the release the upgrade pipeline targets. So:

- The outgoing interfaces became current at **1.6.0** and stayed current through 1.6.2.
- The new interfaces became current at **1.6.3**.

```
bindings/
  onramp/ offramp/ router/        # current (1.6.3) interfaces
  v1_6_0/
    onramp/   # serves 1.6.0 .. <1.6.3  (has 0x82901c45)
    offramp/  # serves 1.6.0 .. <1.6.3
    router/   # serves 1.6.0 .. <1.6.3  (RouteMessage has no queryId)
```

Two traps this case exercises:

- The snapshot is named after **1.6.0** (where the interface *became* current), not 1.6.2 (the tag
  it was *cut* from). Naming it `v1_6_2` would leave `onramp@1.6.1` unresolvable, because 1.6.1
  predates the cut.
- The *replacement* is labelled **1.6.3**, not 1.6.2. The current path's version is the release in
  which the new interface became current — which is not necessarily the tag the commit sits after,
  nor the version in `contracts/package.json` at the commit. Labelling it 1.6.2 would make
  `router@1.6.2` resolve the *new* interface — silently the wrong cell for a genuine 1.6.2
  deployment.

`token_admin_registry` also changed in `c6655369`, but the contract was introduced *by* that
commit — it did not exist at 1.6.2, so there is no outgoing interface to snapshot.

## Snapshot rules

1. **Only what changed.** Never copy unchanged contracts into a checkpoint directory. A
   checkpoint holding an unchanged contract falsely asserts a wire-format difference and is
   the exact class of confusion this design removes.
2. **Snapshot at generation time.** When regenerating bindings, move the outgoing interface
   into its checkpoint directory *before* overwriting the current one. Falling back to
   `git show <tag>:…` is acceptable but risks capturing unreleased work-in-progress.
3. **Generation is tag-driven.** Checkpoint content must reflect a **released tag**, not
   "whatever main was before the next release landed".
4. **Frozen.** Checkpoint directories are never hand-edited. Regenerate from the tag, or
   discard the edit.
5. **A missing checkpoint is an error**, not a fallback to the current interface.

### Transitive coupling (important)

A contract must be snapshotted when **its own** interface changes **or any transitively
inlined dependency's** interface changes. Foreign types embedded with `tlb:"."` are written
**inline into the same cell**, so they are part of the contract's wire format:

```go
// onramp/onramp.go — feequoter's layout is part of OnRamp's message layout
type ExecutorFinishedSuccessfully struct {
    Fee feequoter.Fee `tlb:"."`   // inline, NOT a ref cell
}
```

Other inlined dependencies to watch: `ocr.*` (OnRamp, OffRamp), `ownable2step.Storage`
(almost everything), `common.*` (widespread). Changing `common` can force checkpoints across
many contracts at once; changing a leaf like `router` (no inbound inlining) is isolated.

> "Unchanged contract can use the current bindings for all versions" is true **only if** its
> own interface *and* every transitively inlined dependency is unchanged over that range.
> Otherwise the current copy silently encodes the wrong layout.

## Current bindings are split across two modules

There is no single bindings root today:

| Path | Module | Contents |
|---|---|---|
| `cciplib/ccip/bindings/` | `chainlink-ton/cciplib` | `onramp`, `feequoter`, `common`, `ocr`, `ownable2step` |
| `pkg/ccip/bindings/` | `chainlink-ton` | `router`, `offramp`, `feequoter`, `onramp`, `tokenadminregistry`, … |
| `pkg/bindings/` | `chainlink-ton` | `index.go` (registry), `mcms`, `jetton`, `lib` |

Consequences to resolve during implementation:

- Versioning happens **within each root**; the manifest must span both modules.
- `pkg/ccip/bindings/onramp` is currently a **shim** re-exporting cciplib via `type X = …`.
  Type aliases collapse type identity, so a checkpoint package must **never** be an alias —
  otherwise the registry cannot distinguish versions. Shims may re-export the current
  interface only.

## Consumers

- The registry maps a contract to a `TLBMap` per version. Resolution is per **contract**, so
  different contracts in one message tree may resolve to different interfaces.
- Version selection is carried by the message envelope itself, as an optional `contractVersion`
  field in its JSON:

  ```json
  {"contract":"link.chain.ton.ccip.OnRamp","type":"UpdateSendExecutorMessage",
   "opcode":"0x82901c45","contractVersion":"1.6.2","payload":{...}}
  ```

  `MessageEnvelope.LoadDecoded` pins the registry to that version before decoding, so **every**
  caller honours it with no signature change — the top-level `msg-envelope-to-cell` resolver,
  `InternalMessage.ToMessage` (used when sending), and nested envelope loading
  (`LoadNestedEnvelopes`). Because each envelope pins itself, one message tree may mix versions.

  When `contractVersion` is omitted, the **current** interface is used. An explicit version is
  strongly preferred for authored inputs: a message is encoded for the contract being **called**,
  which is often older than the code being **deployed** in the same pipeline (the very case that
  motivated this design). Defaulting silently to the deployed version would reintroduce the
  ambiguity this scheme removes.
- A request whose version predates every declared interface for a contract fails
  (`ErrNoInterfaceVersion`). It deliberately does **not** fall back, because on TON a wrong
  interface is a silently wrong cell, not a decode error.
- Note `ContractTLBRegistry.Snapshot()` combines versioned keys too, so the same opcode may exist
  under several versions. Any consumer that decodes by opcode alone must pin a version first.

## Not yet decided / follow-ups

- Whether to consolidate `cciplib` and `pkg` bindings into one root.
- Generator + manifest automation, and a CI check that fails when an interface changes without
  a version bump. The fingerprint must cover **messages, storage, and events**, and include
  transitively inlined types — storage matters because `contract-data-to-cell` encodes against
  the storage TLB map, and `c6655369` changed OnRamp storage as well as messages.
- Retention policy for checkpoints once no live contract uses them.
