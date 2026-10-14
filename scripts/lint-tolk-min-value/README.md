# lint-tolk-min-value

Classifies every in-scope incoming message by reading the generated ABI and finding its
`// minval` marker in the contract sources. Deliberately simple: no import following, no union
expansion, no control-flow analysis. It also generates the value-budget spec.

## Marker

One marker per incoming message, anywhere in the contract's sources:

```tolk
// minval:<category> gate=<S|A|none> A=<static|dynamic|none> [<Contract>.]<Message>
// minval.detail: <summary>
//   <optional detail, until the comment block ends>
```

- `category`: `check-admission` | `check-bounce` | `check-fail` | `recovery` | `non-reject` | `best-effort`.
- `gate`: `S` | `A` | `none`; optional — defaults from the category
  (`check-admission`→`A`, `check-bounce`/`check-fail`→`S`, others→`none`).
- `A`: `static` | `dynamic` | `none`; optional — qualifies an `A` gate (`static` fixed threshold,
  `dynamic` when it depends on the message, e.g. `gasLimit`). Requires `gate=A`.
- `<Message>`: the ABI message name (e.g. `TokenPool_LockOrBurn`).
- `<Contract>.` (optional): scopes the marker to one contract; it takes precedence over the
  shared default. Omit it for a message handled identically by every contract that declares it.
- `summary`: the text after `minval.detail:`; following `//` lines are the long-form detail.

### Shared vs contract-qualified

An **unqualified** marker is a shared default for every contract that declares the message. When a
message is handled differently by a specific contract, add a `<Contract>.<Message>` marker for it:

```tolk
// shared default for the pool trait and its implementations
// minval:check-fail gate=S TransferNotificationForRecipient
// minval.detail: custody receipt

// Router handles the same opcode as a flow admission point
// minval:check-admission gate=A A=static Router.TransferNotificationForRecipient
// minval.detail: token-transfer entry
```

Resolution for a contract+message: a `<Contract>.` marker wins; otherwise the single unqualified
marker applies. Findings:

- **missing** — no marker resolves for an ABI message.
- **duplicate** — two unqualified markers for a message, or two markers for the same `<Contract>.<Message>`.
- **invalid** — malformed marker, unknown gate/admission, or `A=` without `gate=A`.
- **stale** — a marker for a message no in-scope contract declares, or a `<Contract>.` marker whose
  contract does not declare the message.

Detail example:

```tolk
// minval:check-admission gate=A A=static TokenPool_LockOrBurn
// minval.detail: outbound flow; safety plus optional admission
//   Checks the resolved safety floor, then the optional admission threshold, before consuming
//   outbound rate-limit capacity. On shortfall the caller owns rejection recovery.
```

## Categories

| Category | Gate | Meaning |
| --- | --- | --- |
| `check-admission` | `A` | Check admission (`A = S + F`) before fixed sends, fan-out or new liabilities. |
| `check-bounce` | `S` | Check safety; reject/bounce (sender can compensate). |
| `check-fail` | `S` | Sender cannot compensate; caught local recovery. |
| `recovery` | `none` | Already unwinding; no gate. |
| `non-reject` | `none` | Committed, no reversal; no gate. |
| `best-effort` | `none` | Documented exception. |

## How it works

1. Read `contracts/build/abi/*.json`; keep contracts whose fully-qualified `description` starts with
   `link.chain.ton.ccip.` or `link.chain.ton.mcms.` (excluding `.cct.`, `.test.`, `.firedrill.`, `.lib.`).
2. Resolve `incoming_messages` through `unique_types` to concrete struct/alias names.
3. Scan `contracts/contracts/**/*.tolk` for markers.
4. Report coverage; fail on missing, invalid or stale markers.

## Usage

```bash
go run ./scripts/lint-tolk-min-value                     # check (exit 1 on gaps)
go run ./scripts/lint-tolk-min-value -verbose            # print each classification
go run ./scripts/lint-tolk-min-value -outdir docs/contracts/overview/ccip/budget/generated
go test ./scripts/lint-tolk-min-value
```

Flags: `-abi` (default `contracts/build/abi`), `-src` (default `contracts/contracts`), `-outdir`
(write `overview.md` and one file per contract), `-verbose`.

Exit codes: `0` clean, `1` coverage/consistency findings, `2` discovery/parsing error.

## Notes

- Shared code (a trait imported by several contracts) needs one unqualified marker; contracts that
  differ add a `<Contract>.` override. Duplicates must be resolved by qualifying.
- This is a coverage and consistency check, not a semantic proof of funding. See
  [`docs/contracts/overview/ccip/budget/`](../../docs/contracts/overview/ccip/budget/) for the model.
