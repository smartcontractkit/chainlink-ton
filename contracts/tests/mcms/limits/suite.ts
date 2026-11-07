import { toNano } from '@ton/core'

import * as mcms from '../../../wrappers/mcms/MCMS'

import {
  COMPUTE_GAS_LIMIT,
  GroupLayout,
  LimitsSigner,
  McmsLimitsHarness,
  Outcome,
  buildStorageConfig,
  flatGroupLayout,
  makeOps,
  makeRootMetadata,
  makeSigners,
} from './harness'
import { MCMS_VERSIONS, McmsVersion, isVersionAvailable } from './versions'

export type ExpectedOutcome = 'success' | 'out-of-gas' | 'value-limited-out-of-gas'
export type SetConfigStrategy = 'direct' | 'staged'

export type Limits = {
  maxSigners: number
  maxGroups: number
  maxSignatures: number
  setConfigStrategy: SetConfigStrategy
}

type CaseBase = {
  name: string
  expected: ExpectedOutcome
  /** Optional gas ceiling for successful cases, to keep a safety margin below 1M. */
  maxGas?: bigint
  /** Optional attached value. Defaults to 2 TON. */
  value?: bigint
}

export type SetConfigCase = CaseBase & {
  op: 'setConfig'
  signers: number
  groups: number
  /** Existing signer count before the update. Omit or use 0 for a fresh contract. */
  fromSigners?: number
  strategy?: SetConfigStrategy
}

export type SetRootCase = CaseBase & {
  op: 'setRoot'
  signers: number
  groups: number
  /** Number of signatures submitted with the root. */
  signatures: number
}

export type ExecuteCase = CaseBase & {
  op: 'execute'
  signers: number
  groups: number
  signatures: number
  ops?: number
}

export type LimitsCase = SetConfigCase | SetRootCase | ExecuteCase

export type LimitsSuiteConfig = {
  version: McmsVersion
  /** Optional expected typeAndVersion version string. */
  expectedVersion?: string
  limits: Limits
  cases: LimitsCase[]
}

const assertValidLimits = (limits: Limits) => {
  if (limits.maxSigners > mcms.MAX_NUM_SIGNERS) {
    throw new Error(`maxSigners ${limits.maxSigners} exceeds contract max ${mcms.MAX_NUM_SIGNERS}`)
  }
  if (limits.maxGroups > mcms.NUM_GROUPS - 1) {
    throw new Error(
      `maxGroups ${limits.maxGroups} exceeds non-root group max ${mcms.NUM_GROUPS - 1}`,
    )
  }
  if (limits.maxGroups > limits.maxSigners) {
    throw new Error(`maxGroups ${limits.maxGroups} exceeds maxSigners ${limits.maxSigners}`)
  }
  if (limits.maxSignatures > limits.maxSigners) {
    throw new Error(`maxSignatures ${limits.maxSignatures} exceeds maxSigners ${limits.maxSigners}`)
  }
  if (limits.maxSignatures < 2) {
    throw new Error(`maxSignatures ${limits.maxSignatures} is below the root quorum`)
  }
}

const layoutFor = (activeGroups: number) =>
  flatGroupLayout({ activeGroups, rootQuorum: activeGroups === 1 ? 1 : 2 })

const expectOutcome = (outcome: Outcome, testCase: CaseBase) => {
  if (testCase.expected === 'success') {
    expect(outcome.exitCode).toBe(0)
    if (testCase.maxGas !== undefined) {
      expect(outcome.gasUsed).toBeLessThanOrEqual(testCase.maxGas)
    }
  } else if (testCase.expected === 'value-limited-out-of-gas') {
    expect(outcome.exitCode).toBe(-14)
    expect(outcome.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)
  } else {
    expect(outcome.exitCode).toBe(-14)
    expect(outcome.gasUsed).toBe(COMPUTE_GAS_LIMIT)
  }
}

const logOutcome = (label: string, outcome: Outcome) => {
  console.log(`${label}: ${outcome.gasUsed} gas (exit ${outcome.exitCode})`)
}

const expectConfigSigners = (config: mcms.Config, signers: LimitsSigner[], layout: GroupLayout) => {
  const expected = buildStorageConfig(signers, layout).config.signers
  expect(config.signers.size).toBe(signers.length)
  for (const [index, signerBytes] of expected) {
    expect(config.signers.get(index)?.equals(signerBytes)).toBe(true)
  }
}

const configure = async (
  harness: McmsLimitsHarness,
  signers: LimitsSigner[],
  layout: GroupLayout,
  strategy: SetConfigStrategy,
  label: string,
) => {
  if (strategy === 'staged') {
    if (!MCMS_VERSIONS[harness.version].supportsStagedConfig) {
      throw new Error(`MCMS ${harness.version} does not support staged config`)
    }
    const outcomes = await harness.stageConfig(signers, layout)
    outcomes.forEach((outcome, index) => logOutcome(`${label} [tx ${index + 1}]`, outcome))
    for (const outcome of outcomes) {
      expect(outcome.exitCode).toBe(0)
      expect(outcome.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)
    }
  } else {
    const outcome = await harness.setConfig(signers, layout)
    logOutcome(label, outcome)
    expect(outcome.exitCode).toBe(0)
  }
}

const runSetConfigCase = async (version: McmsVersion, testCase: SetConfigCase, seed: string) => {
  const layout = layoutFor(testCase.groups)
  const harness = await McmsLimitsHarness.create({ version, ownerSeed: seed })

  if (testCase.fromSigners && testCase.fromSigners > 0) {
    const initialSigners = makeSigners(testCase.fromSigners, layout)
    await configure(
      harness,
      initialSigners,
      layout,
      'direct',
      `${version} ${testCase.name} [setup]`,
    )
    expectConfigSigners(await harness.getConfig(), initialSigners, layout)
  }

  const signers = makeSigners(testCase.signers, layout)
  const strategy = testCase.strategy ?? 'direct'

  if (strategy === 'staged') {
    if (testCase.expected !== 'success') {
      throw new Error('staged setConfig cases must expect success')
    }
    await configure(harness, signers, layout, strategy, `${version} ${testCase.name}`)
    expectConfigSigners(await harness.getConfig(), signers, layout)
    return
  }

  const outcome = await harness.setConfig(signers, layout, { value: testCase.value })
  logOutcome(`${version} ${testCase.name}`, outcome)
  expectOutcome(outcome, testCase)

  if (testCase.expected === 'success') {
    expectConfigSigners(await harness.getConfig(), signers, layout)
  } else if ((testCase.fromSigners ?? 0) > 0) {
    // A failed setConfig must leave the previous signer set untouched. On a fresh
    // contract getConfig is not callable until a config has been written.
    expect((await harness.getConfig()).signers.size).toBe(testCase.fromSigners)
  }
}

// setRoot cases deploy a preconfigured signer set so that signature/group limits are
// measured independently of whether setConfig itself can write that config in one tx.
const runSetRootCase = async (version: McmsVersion, testCase: SetRootCase, seed: string) => {
  if (testCase.signatures > testCase.signers) {
    throw new Error(`signatures ${testCase.signatures} exceeds signers ${testCase.signers}`)
  }
  const layout = layoutFor(testCase.groups)
  const signers = makeSigners(testCase.signers, layout)
  const harness = await McmsLimitsHarness.create({
    version,
    ownerSeed: seed,
    initialConfig: { signers, layout },
  })

  const { outcome } = await harness.setRoot({
    signingSigners: signers.slice(0, testCase.signatures),
    validUntil: 1_000_000n,
    metadata: makeRootMetadata(harness.mcms.address, 0n, 1n),
    ops: makeOps(harness.mcms.address, 1),
    value: testCase.value,
  })

  logOutcome(`${version} ${testCase.name}`, outcome)
  expectOutcome(outcome, testCase)
  const [root] = await harness.getRoot()
  if (testCase.expected === 'success') {
    expect(root).not.toBe(0n)
  } else {
    expect(root).toBe(0n)
  }
}

const runExecuteCase = async (version: McmsVersion, testCase: ExecuteCase, seed: string) => {
  if (testCase.signatures > testCase.signers) {
    throw new Error(`signatures ${testCase.signatures} exceeds signers ${testCase.signers}`)
  }
  const opsCount = testCase.ops ?? 1
  const layout = layoutFor(testCase.groups)
  const signers = makeSigners(testCase.signers, layout)
  const harness = await McmsLimitsHarness.create({
    version,
    ownerSeed: seed,
    initialConfig: { signers, layout },
  })
  const ops = makeOps(harness.mcms.address, opsCount, toNano('0.05'))

  const root = await harness.setRoot({
    signingSigners: signers.slice(0, testCase.signatures),
    validUntil: 1_000_000n,
    metadata: makeRootMetadata(harness.mcms.address, 0n, BigInt(opsCount)),
    ops,
  })
  expect(root.outcome.exitCode).toBe(0)

  const outcome = await harness.execute(ops[0], root.opProofs[0])
  logOutcome(`${version} ${testCase.name}`, outcome)
  expectOutcome(outcome, testCase)
}

const runCase = async (version: McmsVersion, testCase: LimitsCase, seed: string) => {
  switch (testCase.op) {
    case 'setConfig':
      return runSetConfigCase(version, testCase, seed)
    case 'setRoot':
      return runSetRootCase(version, testCase, seed)
    case 'execute':
      return runExecuteCase(version, testCase, seed)
  }
}

export function runLimitsSuite(config: LimitsSuiteConfig) {
  assertValidLimits(config.limits)

  const describeFn = isVersionAvailable(config.version) ? describe : describe.skip
  describeFn(`MCMS limits (${config.version})`, () => {
    if (config.expectedVersion) {
      it('reports the expected contract version', async () => {
        const harness = await McmsLimitsHarness.create({
          version: config.version,
          ownerSeed: `${config.version}-version-check`,
        })
        await harness.deploy()
        const [, version] = await harness.getTypeAndVersion()
        expect(version).toBe(config.expectedVersion)
      })
    }

    it('operates at the configured setConfig limits', async () => {
      const layout = layoutFor(config.limits.maxGroups)
      const signers = makeSigners(config.limits.maxSigners, layout)
      const harness = await McmsLimitsHarness.create({
        version: config.version,
        ownerSeed: `${config.version}-limits-config`,
      })

      await configure(
        harness,
        signers,
        layout,
        config.limits.setConfigStrategy,
        `${config.version} configured setConfig limits`,
      )
      const currentConfig = await harness.getConfig()
      expectConfigSigners(currentConfig, signers, layout)
      expect(currentConfig.groupQuorums.size).toBe(mcms.NUM_GROUPS)
      expect(currentConfig.groupParents.size).toBe(mcms.NUM_GROUPS)
    })

    it('operates at the configured setConfig rotation limit', async () => {
      const layout = layoutFor(config.limits.maxGroups)
      const initialSigners = makeSigners(config.limits.maxSigners, layout)
      const harness = await McmsLimitsHarness.create({
        version: config.version,
        ownerSeed: `${config.version}-limits-rotation`,
        initialConfig: { signers: initialSigners, layout },
      })

      // Preconfigured contracts only become active after their first message.
      await harness.deploy()
      expectConfigSigners(await harness.getConfig(), initialSigners, layout)

      const replacementSigners = makeSigners(config.limits.maxSigners, layout)
      await configure(
        harness,
        replacementSigners,
        layout,
        config.limits.setConfigStrategy,
        `${config.version} configured rotation limits`,
      )
      expectConfigSigners(await harness.getConfig(), replacementSigners, layout)
    })

    it('operates at the configured setRoot signature limit', async () => {
      const layout = layoutFor(config.limits.maxGroups)
      const signers = makeSigners(config.limits.maxSigners, layout)
      const harness = await McmsLimitsHarness.create({
        version: config.version,
        ownerSeed: `${config.version}-limits-root`,
        initialConfig: { signers, layout },
      })

      const { outcome } = await harness.setRoot({
        signingSigners: signers.slice(0, config.limits.maxSignatures),
        validUntil: 1_000_000n,
        metadata: makeRootMetadata(harness.mcms.address, 0n, 1n),
        ops: makeOps(harness.mcms.address, 1),
      })
      logOutcome(`${config.version} configured setRoot limit`, outcome)
      expect(outcome.exitCode).toBe(0)
      expect(outcome.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)
    })

    config.cases.forEach((testCase, index) => {
      it(testCase.name, async () => {
        await runCase(config.version, testCase, `${config.version}-case-${index}`)
      })
    })
  })
}
