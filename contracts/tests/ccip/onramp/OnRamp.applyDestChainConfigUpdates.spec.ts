import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/ccip/OnRamp'
import { CHAINSEL_EVM_TEST, CHAINSEL_EVM_TEST_90000002, setup } from './OnRamp.Setup'

describe('OnRamp - Apply Dest Chain Config Updates', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let config: or.DynamicConfig
  let mockRouter: SandboxContract<TreasuryContract>
  let allowlistAdmin: SandboxContract<TreasuryContract>
  let allowedSendersGroup1: SandboxContract<TreasuryContract>[] = []
  let allowedSendersGroup2: SandboxContract<TreasuryContract>[] = []

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    allowlistAdmin = await blockchain.treasury('allowlistAdmin')
    ;({ deployer, onramp, config } = await setup(blockchain, {
      config: { allowlistAdmin: allowlistAdmin.address },
    }))

    mockRouter = await blockchain.treasury('mockRouter')
    allowedSendersGroup1 = []
    allowedSendersGroup2 = []
    for (let i = 0; i < 2; i++) {
      const addr = await blockchain.treasury(`allowedSender${i}`)
      allowedSendersGroup1.push(addr)
    }
    for (let i = 0; i < 2; i++) {
      const addr = await blockchain.treasury(`allowedSender${i + 2}`)
      allowedSendersGroup2.push(addr)
    }
  })

  const configureDestChainConfigs = async () => {
    const result = await onramp.sendUpdateDestChainConfigs(deployer.getSender(), {
      value: toNano('0.5'),
      destChainConfigs: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          router: mockRouter.address,
          allowlistEnabled: true,
        },
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000002,
          router: mockRouter.address,
          allowlistEnabled: true,
        },
      ],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    expect(await onramp.getExpectedNextSequenceNumber(CHAINSEL_EVM_TEST)).toBe(1n)
    expect(await onramp.getExpectedNextSequenceNumber(CHAINSEL_EVM_TEST_90000002)).toBe(1n)
    const loadedConfig = await onramp.getDestChainConfig(CHAINSEL_EVM_TEST)
    expect(loadedConfig.allowlistEnabled).toBe(true)
    expect(loadedConfig.router).toEqual(mockRouter.address)
    const loadedConfig2 = await onramp.getDestChainConfig(CHAINSEL_EVM_TEST_90000002)
    expect(loadedConfig2.allowlistEnabled).toBe(true)
    expect(loadedConfig2.router).toEqual(mockRouter.address)

    const destChainSelectors = await onramp.getDestChainSelectors()
    expect(destChainSelectors).toContain(CHAINSEL_EVM_TEST)
    expect(destChainSelectors).toContain(CHAINSEL_EVM_TEST_90000002)
  }

  const expectedAllowlistMatches = async (
    selector: bigint,
    expectedContracts: SandboxContract<TreasuryContract>[],
  ) => {
    const actual = await onramp.getAllowedSendersList(selector)
    const expected = expectedContracts.map((contract) => contract.address)
    expect(actual).toEqual(expect.arrayContaining(expected))
    expect(actual).toHaveLength(expected.length)
  }

  const seedInitialAllowlists = async () => {
    const updates: or.UpdateAllowlists = {
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          add: allowedSendersGroup1.map((s) => s.address),
          remove: [],
        },
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000002,
          add: allowedSendersGroup2.map((s) => s.address),
          remove: [],
        },
      ],
    }

    const result = await onramp.sendUpdateAllowlists(deployer.getSender(), {
      value: toNano('0.5'),
      updateAllowlists: updates,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    expect(await onramp.getIsChainSupported(0n /*random selector*/)).toBe(false)
    expect(await onramp.getIsChainSupported(CHAINSEL_EVM_TEST)).toBe(true)
    expect(await onramp.getIsChainSupported(CHAINSEL_EVM_TEST_90000002)).toBe(true)
  }

  it('allows owner to add multiple addresses per chain', async () => {
    await configureDestChainConfigs()

    await seedInitialAllowlists()

    await expectedAllowlistMatches(CHAINSEL_EVM_TEST, allowedSendersGroup1)
    await expectedAllowlistMatches(CHAINSEL_EVM_TEST_90000002, allowedSendersGroup2)
  })

  it('allows allowlist admin to delete multiple addresses', async () => {
    await configureDestChainConfigs()
    await seedInitialAllowlists()

    const removeUpdates: or.UpdateAllowlists = {
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          add: [],
          remove: allowedSendersGroup1.map((s) => s.address),
        },
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000002,
          add: [],
          remove: allowedSendersGroup2.map((s) => s.address),
        },
      ],
    }

    const result = await onramp.sendUpdateAllowlists(allowlistAdmin.getSender(), {
      value: toNano('0.5'),
      updateAllowlists: removeUpdates,
    })

    expect(result.transactions).toHaveTransaction({
      from: allowlistAdmin.address,
      to: onramp.address,
      success: true,
    })

    const emptyGroup: SandboxContract<TreasuryContract>[] = []
    await expectedAllowlistMatches(CHAINSEL_EVM_TEST, emptyGroup)
    await expectedAllowlistMatches(CHAINSEL_EVM_TEST_90000002, emptyGroup)
  })

  it('handles simultaneous adds and deletes', async () => {
    await configureDestChainConfigs()
    await seedInitialAllowlists()

    const additionalSenderGroup1 = await blockchain.treasury('additionalSender0')
    const additionalSenderGroup2 = await blockchain.treasury('additionalSender1')

    const mixedUpdates: or.UpdateAllowlists = {
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          add: [additionalSenderGroup1.address],
          remove: [allowedSendersGroup1[0].address],
        },
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000002,
          add: [additionalSenderGroup2.address],
          remove: [allowedSendersGroup2[1].address],
        },
      ],
    }

    const result = await onramp.sendUpdateAllowlists(allowlistAdmin.getSender(), {
      value: toNano('0.5'),
      updateAllowlists: mixedUpdates,
    })

    expect(result.transactions).toHaveTransaction({
      from: allowlistAdmin.address,
      to: onramp.address,
      success: true,
    })

    await expectedAllowlistMatches(CHAINSEL_EVM_TEST, [
      allowedSendersGroup1[1],
      additionalSenderGroup1,
    ])
    await expectedAllowlistMatches(CHAINSEL_EVM_TEST_90000002, [
      allowedSendersGroup2[0],
      additionalSenderGroup2,
    ])
  })

  it('rejects updates from unauthorized senders', async () => {
    await configureDestChainConfigs()
    await seedInitialAllowlists()

    const randomSender = await blockchain.treasury('randomSender')
    const updateAllowlists: or.UpdateAllowlists = {
      updates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          add: allowedSendersGroup1.map((s) => s.address),
          remove: [],
        },
      ],
    }

    const result = await onramp.sendUpdateAllowlists(randomSender.getSender(), {
      value: toNano('0.5'),
      updateAllowlists,
    })

    expect(result.transactions).toHaveTransaction({
      from: randomSender.address,
      to: onramp.address,
      success: false,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'onramp_apply_dest_chain_config_updates',
        [
          {
            code: await or.OnRamp.code(),
            name: 'onramp',
          },
        ],
      )
    }
  })
})
