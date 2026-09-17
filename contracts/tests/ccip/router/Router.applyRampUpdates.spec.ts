import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'

import { generateRandomTonAddress } from '../../../src/utils'
import { assertLog } from '../../Logs'
import * as coverage from '../../coverage/coverage'
import { LogTypes } from '../../../wrappers/ccip/Logs'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as Setup from './Router.Setup'
import { ChainSelectors } from '../../utils/Selectors'

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    ;({ deployer, sender, router, feeQuoter, onRamp } = await Setup.setup(blockchain))
  })

  it('update router onramps in batch', async () => {
    {
      const result = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          onRampUpdates: rt.OnRamps.create({
            destChainSelectors: [
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
            ],
            onRamp: onRamp.address,
          }),
        }),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    {
      let result = await router.getOnRamp(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001)
      expect(result).toEqual(onRamp.address)

      result = await router.getOnRamp(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002)
      expect(result).toEqual(onRamp.address)
    }

    {
      let result = await router.getOnRamps()
      expect(result).toEqual([
        rt.Ramp.create({
          chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
          ramp: onRamp.address,
        }),
        rt.Ramp.create({
          chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          ramp: onRamp.address,
        }),
      ])
    }

    {
      let result = await router.getDestChainSelectors()
      expect(result.sort()).toEqual(
        [
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
        ].sort(),
      )
    }
  })

  it('update router offRamp events emission', async () => {
    const offRampAddress1 = await generateRandomTonAddress()
    {
      // test update method wrapper
      const result = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampAdds: rt.OffRamps.create({
            sourceChainSelectors: [
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
            ],
            offRamp: offRampAddress1,
          }),
        }),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.OffRampAdded, {
        sourceChainSelectors: [
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
        ],
        offRampAdded: offRampAddress1,
      })

      // test update method wrapper
      const result2 = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampRemoves: rt.OffRamps.create({
            sourceChainSelectors: [
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
            ],
            offRamp: offRampAddress1,
          }),
        }),
      )
      expect(result2.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result2.transactions, router.address, LogTypes.OffRampRemoved, {
        sourceChainSelectors: [
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
        ],
        offRampRemoved: offRampAddress1,
      })
    }
  })

  it('update router offramps in batch with one offRamp address', async () => {
    const offRampAddress1 = await generateRandomTonAddress()
    {
      // test update method wrapper
      const result = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampAdds: rt.OffRamps.create({
            sourceChainSelectors: [
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
            ],
            offRamp: offRampAddress1,
          }),
        }),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.OffRampAdded, {
        sourceChainSelectors: [
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
        ],
        offRampAdded: offRampAddress1,
      })
    }

    {
      //test batch getter
      let result = await router.getOffRamps()
      expect(result.sort()).toEqual(
        [
          rt.Ramp.create({
            chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
            ramp: offRampAddress1,
          }),
          rt.Ramp.create({
            chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            ramp: offRampAddress1,
          }),
        ].sort(),
      )
    }

    {
      // test individual getter
      let result = await router.getOffRamp(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001)
      expect(result).toEqual(offRampAddress1)

      result = await router.getOffRamp(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002)
      expect(result).toEqual(offRampAddress1)
    }

    {
      //test removing ramps wrapper
      const result = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampRemoves: rt.OffRamps.create({
            sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
            offRamp: offRampAddress1,
          }),
        }),
      )

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      let getResult = await router.getOffRamps()
      expect(getResult).toEqual([
        rt.Ramp.create({
          chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
          ramp: offRampAddress1,
        }),
      ])
    }

    {
      const offRampAddress2 = await generateRandomTonAddress()
      //test adding and removing on the same call
      const result = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampAdds: rt.OffRamps.create({
            sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
            offRamp: offRampAddress2,
          }),
          offRampRemoves: rt.OffRamps.create({
            sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002],
            offRamp: offRampAddress1,
          }),
        }),
      )
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      const getResult = await router.getOffRamps()
      expect(getResult).toEqual([
        rt.Ramp.create({
          chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          ramp: offRampAddress2,
        }),
      ])
    }
  })

  it('removes router offramps in batch', async () => {
    const offRampAddress = await generateRandomTonAddress()

    {
      const addResult = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampAdds: rt.OffRamps.create({
            sourceChainSelectors: [
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
              ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
            ],
            offRamp: offRampAddress,
          }),
        }),
      )

      expect(addResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    {
      const removeResult = await router.sendRouterApplyRampUpdates(
        deployer.getSender(),
        toNano('1'),
        rt.Router_ApplyRampUpdates.create({
          queryId: BigInt(0),
          offRampRemoves: rt.OffRamps.create({
            sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
            offRamp: offRampAddress,
          }),
        }),
      )

      expect(removeResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(removeResult.transactions, router.address, LogTypes.OffRampRemoved, {
        sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
        offRampRemoved: offRampAddress,
      })
    }

    {
      const result = await router.getOffRamps()
      expect(result).toEqual([
        rt.Ramp.create({
          chainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
          ramp: offRampAddress,
        }),
      ])
    }
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_applyRampUpdates',
        await Setup.contractsCoverageConfig(),
      )
    }
  })
})
