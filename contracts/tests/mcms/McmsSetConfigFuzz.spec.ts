import { randomBytes, SigningKey } from 'ethers'

import {
  COMPUTE_GAS_LIMIT,
  GroupLayout,
  LimitsSigner,
  McmsLimitsHarness,
  buildStorageConfig,
  flatGroupLayout,
} from './limits/harness'
import { isVersionAvailable } from './limits/versions'

const VERSION = '1.6.2'
// Keep the default short enough for CI. Run the full proof with:
//   MCMS_FUZZ_ITERATIONS=10000 ...
const DEFAULT_ITERATIONS = 100
const ITERATIONS = Number(process.env['MCMS_FUZZ_ITERATIONS'] ?? DEFAULT_ITERATIONS)
const FUZZ_TIMEOUT_MS = 60 * 60 * 1000
// Recreate the sandbox periodically: a single blockchain retains every transaction,
// which otherwise exhausts the Node heap over a 10k-iteration run.
const CHUNK_SIZE = Number(process.env['MCMS_FUZZ_CHUNK'] ?? 500)

function makeRandomSigners(count: number, layout: GroupLayout): LimitsSigner[] {
  const addresses = Array.from({ length: count }, () => {
    const bytes = randomBytes(20)
    return BigInt(`0x${Buffer.from(bytes).toString('hex')}`)
  }).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  return addresses.map((address, index) => ({
    address: `0x${address.toString(16).padStart(40, '0')}`,
    keyPair: null as unknown as SigningKey,
    index,
    group: layout.groupForIndex(index),
  }))
}

function expectConfigSigners(
  config: Awaited<ReturnType<McmsLimitsHarness['getConfig']>>,
  signers: LimitsSigner[],
  layout: GroupLayout,
) {
  expect(config.signers.size).toBe(signers.length)
  const expected = buildStorageConfig(signers, layout).config.signers
  for (const [index, signerBytes] of expected) {
    expect(config.signers.get(index)?.equals(signerBytes)).toBe(true)
  }
}

const describeFuzz = isVersionAvailable(VERSION) ? describe : describe.skip

describeFuzz(`MCMS setConfig fuzz (${VERSION})`, () => {
  it(
    'fuzzes 69/21 -> 16/8 -> 69/21',
    async () => {
      for (let offset = 0; offset < ITERATIONS; offset += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, ITERATIONS - offset)
        const initialLayout = flatGroupLayout({ activeGroups: 21 })
        const initialSigners = makeRandomSigners(69, initialLayout)
        const harness = await McmsLimitsHarness.create({
          version: VERSION,
          ownerSeed: `mcms-setconfig-fuzz-${offset}`,
          initialConfig: { signers: initialSigners, layout: initialLayout },
        })
        await harness.deploy()

        for (let i = 0; i < chunkSize; i++) {
          const intermediateLayout = flatGroupLayout({ activeGroups: 8 })
          const intermediateSigners = makeRandomSigners(16, intermediateLayout)
          const finalLayout = flatGroupLayout({ activeGroups: 21 })
          const finalSigners = makeRandomSigners(69, finalLayout)

          const intermediate = await harness.setConfig(intermediateSigners, intermediateLayout)
          expect(intermediate.exitCode).toBe(0)
          expect(intermediate.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)

          const final = await harness.setConfig(finalSigners, finalLayout)
          expect(final.exitCode).toBe(0)
          expect(final.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)

          expectConfigSigners(await harness.getConfig(), finalSigners, finalLayout)
        }
      }
    },
    FUZZ_TIMEOUT_MS,
  )

  it(
    'fuzzes 52/21 -> 52/21 single-step boundary',
    async () => {
      for (let offset = 0; offset < ITERATIONS; offset += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, ITERATIONS - offset)
        const initialLayout = flatGroupLayout({ activeGroups: 21 })
        const initialSigners = makeRandomSigners(52, initialLayout)
        const harness = await McmsLimitsHarness.create({
          version: VERSION,
          ownerSeed: `mcms-setconfig-single-step-fuzz-${offset}`,
          initialConfig: { signers: initialSigners, layout: initialLayout },
        })
        await harness.deploy()

        for (let i = 0; i < chunkSize; i++) {
          const finalLayout = flatGroupLayout({ activeGroups: 21 })
          const finalSigners = makeRandomSigners(52, finalLayout)

          const final = await harness.setConfig(finalSigners, finalLayout)
          expect(final.exitCode).toBe(0)
          expect(final.gasUsed).toBeLessThan(COMPUTE_GAS_LIMIT)

          expectConfigSigners(await harness.getConfig(), finalSigners, finalLayout)
        }
      }
    },
    FUZZ_TIMEOUT_MS,
  )
})
