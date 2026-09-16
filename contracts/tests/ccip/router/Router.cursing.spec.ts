import { toNano, Cell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { LogTypes } from '../../../wrappers/ccip/Logs'
import { assertLog } from '../../Logs'
import * as coverage from '../../coverage/coverage'
import { WRAPPED_NATIVE } from '../../../src/utils'

import * as rt from '../../../wrappers/gen/ccip/Router'
import { ccipSendCost, RMNREMOTE_GLOBAL_CURSE_SUBJECT } from '../../../wrappers/ccip/Router'
import { setup, contractsCoverageConfig } from './Router.Setup'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'

describe('Router.cursing', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>

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
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
  })

  beforeEach(async () => {
    ;({ deployer, sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
  })

  it('router respects cursing', async () => {
    const msg = {
      queryID: 1n,
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: WRAPPED_NATIVE,
      extraArgs: rt.GenericExtraArgsV2.create({ gasLimit: 100n, allowOutOfOrderExecution: true }),
    }

    // Curse the lane
    {
      const result = await router.sendRouterRMNRemoteCurse(deployer.getSender(), toNano('1'), {
        queryId: 0n,
        subjects: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.Cursed, {
        subject: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      })

      await verifyNotCursed(router, deployer, false)
      const cursedSubjects = await router.getCursedSubjects()
      expect(cursedSubjects).toEqual([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001])
    }

    // Fail router.ccipSend
    {
      const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, msg)

      // we called the router
      expect(result.transactions).toHaveTransaction({
        from: sender.address,
        to: router.address,
        deploy: false,
        success: false,
        exitCode: rt.Router.Errors['Router_Error.SubjectCursed'],
      })
    }

    // Uncurse the lane
    {
      const result = await router.sendRouterRMNRemoteUncurse(deployer.getSender(), toNano('1'), {
        queryId: 0n,
        subjects: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.Uncursed, {
        subject: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      })

      await verifyNotCursed(router, deployer, true)
      const cursedSubjects = await router.getCursedSubjects()
      expect(cursedSubjects).toEqual([])
    }

    // Succeed router.ccipSend
    {
      const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, msg)

      expect(result.transactions).toHaveTransaction({
        from: sender.address,
        to: router.address,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: onRamp.address,
        success: true,
      })
    }
  })

  it('router respect global cursing', async () => {
    // Curse all lanes
    {
      const result = await router.sendRouterRMNRemoteCurse(deployer.getSender(), toNano('1'), {
        queryId: 0n,
        subjects: [RMNREMOTE_GLOBAL_CURSE_SUBJECT],
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.Cursed, {
        subject: RMNREMOTE_GLOBAL_CURSE_SUBJECT,
      })

      await verifyNotCursed(router, deployer, false)
      const cursedSubjects = await router.getCursedSubjects()
      expect(cursedSubjects).toEqual([RMNREMOTE_GLOBAL_CURSE_SUBJECT])
    }

    // Uncurse all lanes
    {
      const result = await router.sendRouterRMNRemoteUncurse(deployer.getSender(), toNano('1'), {
        queryId: 0n,
        subjects: [RMNREMOTE_GLOBAL_CURSE_SUBJECT],
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.Uncursed, {
        subject: RMNREMOTE_GLOBAL_CURSE_SUBJECT,
      })

      await verifyNotCursed(router, deployer, true)
      const cursedSubjects = await router.getCursedSubjects()
      expect(cursedSubjects).toEqual([])
    }
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_cursing',
        await contractsCoverageConfig(),
      )
    }
  })
})
async function verifyNotCursed(
  router: SandboxContract<rt.Router>,
  deployer: SandboxContract<TreasuryContract>,
  expected: boolean,
) {
  expect(
    await router.getVerifyNotCursed(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
  ).toBe(expected)

  const verification = await router.sendRouterRMNRemoteVerifyNotCursed(
    deployer.getSender(),
    toNano('1'),
    { queryId: 0n, subject: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 },
  )
  expect(verification.transactions).toHaveTransaction({
    from: deployer.address,
    to: router.address,
    success: true,
  })
  expect(verification.transactions).toHaveTransaction({
    from: router.address,
    to: deployer.address,
    success: true,
    op: rt.Router_RMNRemoteVerifyNotCursedResponse.PREFIX,
    body(x) {
      if (!x) return false
      const resp = rt.Router_RMNRemoteVerifyNotCursedResponse.fromSlice(x.beginParse())
      return resp.queryId === 0n && resp.result === expected
    },
  })
}
