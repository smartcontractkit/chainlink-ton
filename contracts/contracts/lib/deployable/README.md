# Deployable contract

Notice: The `deployable` bytecode is meant to be static and immutable, for this reason the contract is no longer compiled and we store this pre-compiled pinned version as `Deployable.boc`.

`Acton.toml`'s `[contracts.Deployable]` entry points `src` directly at `Deployable.boc` (acton's
precompiled-boc support: https://ton-blockchain.github.io/acton/docs/building/precompiled-boc),
so `acton build` never recompiles it from `contract.tolk` -- it just re-emits the pinned code as
`build/Deployable.json`, which `scripts/actonBuildAdapter.ts` converts into the legacy
`build/Deployable.compiled.json` shape alongside every other contract.

Runtime code-hash checks (`wrappers/codeLoader.ts`, `deployment/utils/compiled_contracts.go`)
still verify the loaded code against the pinned `DEPLOYABLE_HASH`/`DeployableCodeHash` constant on
every load, so any accidental drift in the pinned bytecode is still caught.
