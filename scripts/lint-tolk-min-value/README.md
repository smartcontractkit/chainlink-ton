# lint-tolk-min-value

Classifies declared incoming messages of CCIP/MCMS contracts using explicit policy-group tags.
It follows each contract's relative Tolk imports and expands message unions within that closure.
CCT/wGRAM and test contracts are excluded from discovery; binding-only templates are skipped.
Each message needs exactly one import-scoped tag and a description:

```tolk
// lint:min-value/<group> <Message> <description>
```

An em dash before the description is optional. The supported groups match
[`MIN-VALUE-CHECKS.md`](../../docs/contracts/overview/ccip/MIN-VALUE-CHECKS.md):

| Group | Policy | Source requirement |
| --- | --- | --- |
| `multi-hop` | Start with safety and optional admission | Two nearby `assertMinValue` calls |
| `normal` | Safely reject shortfall | A nearby `assertMinValue` call |
| `normal-local` | Handle shortfall with implemented local recovery | A nearby call inside an enclosing `try/catch` |
| `recovery` | Already unwinding | No nearby `assertMinValue` gate |
| `non-reject` | Committed work without implemented reversal | No nearby `assertMinValue` gate |
| `best-effort` | Deliberately exempt passive/security/escape operation | No nearby gate; description justifies the exception |

## Checked handler

An actual `assertMinValue(...)` call must follow within five source lines, before the enclosing
block closes. Comments and strings do not count. The check may be inside `try/catch` when
the handler has implemented local recovery:

```tolk
try {
    // lint:min-value/normal-local DepositAccount_Reply — account ready, no withdraw yet; abort on shortfall
    val minValue = st.poolData.load().rollback.admin.resolve(ccipAdminMinValue());
    assertMinValue(msgValue, minValue, TokenPool_Error.InsufficientMessageValue);
} catch (errorCode) {
    // Existing authenticated operation recovery.
}
```

## Ungated handler

Distinguish recovery from committed completion and a deliberate exception. Explain why:

```tolk
// lint:min-value/recovery TokenPool_PreflightCheckFailed — unwind the failed attempt
// lint:min-value/non-reject JettonLockBox_Deposited — custody committed; no reversal path exists
// lint:min-value/best-effort ReturnExcessesBack — passive receipt only; retain excess coins
```

This waives the value gate, not authentication. It does not guarantee funding, catch OOG, or prove
successful recovery. The linter does not prove the chosen policy, admission expression, correctness
of a catch, or control-flow reachability. Its five-line window does not inspect later or delegated
checks. Mixed-purpose messages need path-specific review: the tag describes the normal path,
while recovery branches bypass the normal gate.

## Usage

```bash
nix develop .#contracts -c lint-tolk-min-value
nix develop .#contracts -c lint-tolk-min-value contracts/contracts/ccip/pools
go test -race ./scripts/lint-tolk-min-value
go vet ./scripts/lint-tolk-min-value
```

The root defaults to the working directory. Full scope currently reports unfinished non-pool
rollout; the TP subtree can be checked independently, including its imports outside the subtree.

The tool reports counts per group. It rejects missing/duplicate tags in a contract's import
closure, legacy/malformed tags, unknown groups, missing descriptions, stale tags and group-specific
check violations. Missing imports, unresolved message types,
filesystem errors and **zero discovered contracts fail**, rather than producing a clean report.
Shared messages must be classified separately for unrelated contracts; their tags cannot satisfy
one another globally. Shared imported handlers need only one tag within each importing closure.

**Limit:** coverage starts from declared `incomingMessages`. Fallback handlers must be included in
that inventory. This is a lightweight source linter, not a Tolk compiler or semantic analyzer.

Exit codes: `0` clean, `1` classification findings, `2` discovery/parsing/invocation error.
