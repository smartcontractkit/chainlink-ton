# TON MCMS Version Selection In CLD Tooling

## Problem

The TON MCMS deployment flow writes datastore refs with the per-contract versions from the selected contracts package, but the CLD reader path for MCMS operations selects refs using global version constants.

Current local contract package versions:

- [rbac_timelock.tolk](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/contracts/contracts/mcms/rbac_timelock.tolk#L12): `0.0.4`
- [mcms.tolk](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/contracts/contracts/mcms/mcms.tolk#L14): `0.0.5`

Current reader constants:

- [TimelockVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L28)
- [MCMSVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L29)

Updating those constants fixes tooling for the current local contracts package. The remaining question is whether this is enough for environments that may contain old and new MCMS suites. It is not: the current lookup path can only target one MCMS/Timelock version pair globally.

## Relevant Call Path

Deployment stores refs using contract package metadata:

- [DeployMCMSSequence](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/pkg/ops/mcms/deploy.go#L61) resolves compiled contracts through [RetrieveCompiledTONContracts](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/compiled_contracts.go#L88).
- [RetrieveCompiledTONContracts](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/compiled_contracts.go#L88) reads [contracts-pkg.json](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/compiled_contracts.go#L32) and attaches each contract's declared version to the compiled contract metadata.
- [InvokeDeployContractOperation](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/operation/deploy_ton_contract.go#L67) returns an [AddressRef](https://github.com/smartcontractkit/chainlink-deployments-framework/tree/main/datastore/address_ref.go#L31) with [Version](https://github.com/smartcontractkit/chainlink-deployments-framework/tree/main/datastore/address_ref.go#L43): [compiledContract.Version](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/pkg/ops/ton/types.go#L135-L140).
- [deployMCMSSequence](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/pkg/ops/mcms/deploy.go#L68) then assigns the qualifier and labels before returning refs to the changeset output.

MCMS operations read refs through exact version constants:

- [MCMSReaderAdapter.GetTimelockRef](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/mcms_reader.go#L50-L59) uses [state.TimelockVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L28).
- [MCMSReaderAdapter.GetMCMSRef](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/mcms_reader.go#L62-L84) uses [state.MCMSVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L29).
- Both call [GetAddressRef](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/datastore/datastore.go#L128), which matches `(chain selector, type, version, qualifier)`.

Transfer ownership also depends on the same reader path:

- [TonTransferOwnershipAdapter.InitializeTimelockAddress](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/transfer_ownership.go#L39-L57) calls [MCMSReaderAdapter.GetTimelockRef](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/mcms_reader.go#L50-L59) before building transfer/accept operations.
- [changesets.NewOutputBuilder](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/changesets/output.go#L86).[OutputBuilder.Build](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/changesets/output.go#L142) later uses [MCMSReaderRegistry](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/changesets/output.go#L31) to build MCMS proposals and chain metadata from [mcms.Input](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/mcms/mcms.go#L10).

State loading has a related sharp edge:

- [LoadMCMSOnChainState](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/mcms.go#L40-L54) delegates to [loadMCMSChainState](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/mcms.go#L64-L111).
- [loadMCMSChainState](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/mcms.go#L64-L111) comments that it wants the latest version, but it does not compare [semver.Version](https://github.com/Masterminds/semver/blob/v3.4.0/version.go#L67) values; it overwrites state as it iterates datastore refs.

## Impact

After bumping [TimelockVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L28) and [MCMSVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L29) via [semver.MustParse](https://github.com/Masterminds/semver/blob/v3.4.0/version.go#L308), new local deployments work because the lookup constants match the package metadata.

The tradeoff is that older MCMS suites become invisible to the default MCMS reader path if their refs are still stored as:

- Timelock `0.0.3`
- MCMS `0.0.4`

This affects any workflow that uses [MCMSReaderRegistry](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/changesets/output.go#L31) rather than directly carrying fully resolved refs. Examples include transfer ownership, proposal building, MCMS chain metadata, and any future CLD changeset that asks for the MCMS suite by qualifier/action.

If old and new refs coexist under the same qualifier, the current code does not provide an explicit selection model. If they coexist under different qualifiers, selection by qualifier helps, but only when the selected suite also matches the globally hardcoded versions.

## Proposed Solutions

### 1. Resolve Latest Semver By Default

Add a TON-side helper that selects the highest semver ref for `(chain selector, contract type, qualifier)` and use it in:

- [MCMSReaderAdapter.GetTimelockRef](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/mcms_reader.go#L50-L59)
- [MCMSReaderAdapter.GetMCMSRef](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/mcms_reader.go#L62-L84)
- [loadMCMSChainState](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/mcms.go#L64-L111)

This aligns implementation with the existing state-loading comment and avoids breaking old datastore snapshots when the default version moves forward.

This should be the baseline behavior when callers do not request a specific version.

### 2. Add TON-Local Explicit Version Selection For Migration Workflows

For cases where operators need to target a specific old/new suite, expose version selection in chainlink-ton rather than in [mcms.Input](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/mcms/mcms.go#L10). [mcms.Input](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/mcms/mcms.go#L10) belongs to chainlink-ccip, so adding TON-specific MCMS/Timelock version fields there is not a good fit.

Possible TON-local shapes:

- adapter config passed when registering or constructing [MCMSReaderAdapter](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/ccip/1_6_0/sequences/mcms_reader.go#L22)
- a TON-specific reader input wrapper around [mcms.Input](https://github.com/smartcontractkit/chainlink-ccip/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/utils/mcms/mcms.go#L10)
- datastore metadata/labels that identify the intended suite version during migration
- helper functions that accept optional [MCMSVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L29) and [TimelockVersion](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/state.go#L28) parameters before falling back to latest-version selection

Default behavior can remain latest-version selection. TON-local explicit versions would override it only in migration workflows that need exact old/new suite targeting.

### 3. Treat Qualifiers As Suite Identity, Not Version Selection

Using distinct qualifiers for old and new suites is still useful operationally, but it should not be the only versioning mechanism. Qualifier selection and version selection answer different questions:

- qualifier: which MCMS suite/role set?
- version: which implementation version of that suite?

The current code partially conflates this by allowing qualifier selection but pinning version globally.

## Recommended Path

1. Keep the immediate constant bump so current local deployments work.
2. Add latest-version ref selection for MCMS and Timelock lookup by `(chain selector, type, qualifier)`.
3. Update [loadMCMSChainState](https://github.com/smartcontractkit/chainlink-ton/tree/chore/contracts/upgrade-tolk-1.3.0-1.4.0/deployment/state/mcms.go#L64-L111) to use deterministic [semver.Version](https://github.com/Masterminds/semver/blob/v3.4.0/version.go#L67) ordering instead of datastore iteration order.
4. Add explicit version override support if migration tooling needs to operate old and new suites side-by-side.

## Test Cases

- Only old refs exist: reader resolves Timelock `0.0.3` and MCMS `0.0.4`.
- Only new refs exist: reader resolves Timelock `0.0.4` and MCMS `0.0.5`.
- Old and new refs exist with the same qualifier: default reader resolves the highest semver.
- Old and new refs exist with different qualifiers: reader resolves latest within the requested qualifier.
- Explicit version requested: reader resolves that exact version or fails clearly.
- Transfer ownership works with current local MCMS `0.0.5` and Timelock `0.0.4` refs.
