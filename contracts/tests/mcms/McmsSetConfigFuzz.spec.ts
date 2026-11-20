import {
  COMPUTE_GAS_LIMIT,
  GroupLayout,
  LimitsSigner,
  McmsLimitsHarness,
  buildStorageConfig,
  flatGroupLayout,
  makeSigners,
} from './limits/harness'

const VERSION = 'local'
// Keep the default short enough for CI. Run the full proof with:
//   MCMS_FUZZ_ITERATIONS=10000 ...
const DEFAULT_ITERATIONS = 100
const ITERATIONS = Number(process.env['MCMS_FUZZ_ITERATIONS'] ?? DEFAULT_ITERATIONS)
const FUZZ_TIMEOUT_MS = 60 * 60 * 1000

function expectConfigSigners(
  config: Awaited<ReturnType<McmsLimitsHarness['getConfig']>>,
  signers: LimitsSigner[],
  layout: GroupLayout,
) {
  const expected = buildStorageConfig(signers, layout).config.signers
  expect(config.signers.size).toBe(signers.length)
  for (const [index, signerBytes] of expected) {
    expect(config.signers.get(index)?.equals(signerBytes)).toBe(true)
  }
}

describe(`MCMS setConfig fuzz (${VERSION})`, () => {
  it(
    'fuzzes the 52/21 direct single-step boundary',
    async () => {
      const layout = flatGroupLayout({ activeGroups: 21 })
      const initialSigners = makeSigners(52, layout)
      const harness = await McmsLimitsHarness.create({
        version: VERSION,
        ownerSeed: 'mcms-setconfig-direct-fuzz',
        initialConfig: { signers: initialSigners, layout },
      })
      await harness.deploy()

      for (let i = 0; i < ITERATIONS; i++) {
        const signers = makeSigners(52, layout)
        const outcome = await harness.setConfig(signers, layout)
        expect(outcome.exitCode).toBe(0)
        expect(outcome.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)
        expectConfigSigners(await harness.getConfig(), signers, layout)
      }
    },
    FUZZ_TIMEOUT_MS,
  )

  it(
    'fuzzes a 69/21 staged update from 52/21',
    async () => {
      const layout = flatGroupLayout({ activeGroups: 21 })
      const initialSigners = makeSigners(52, layout)
      const harness = await McmsLimitsHarness.create({
        version: VERSION,
        ownerSeed: 'mcms-setconfig-staged-fuzz',
        initialConfig: { signers: initialSigners, layout },
      })
      await harness.deploy()

      for (let i = 0; i < ITERATIONS; i++) {
        const signers = makeSigners(69, layout)
        const outcomes = await harness.stageConfig(signers, layout)
        for (const outcome of outcomes) {
          expect(outcome.exitCode).toBe(0)
          expect(outcome.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)
        }
        expectConfigSigners(await harness.getConfig(), signers, layout)
      }
    },
    FUZZ_TIMEOUT_MS,
  )
})
