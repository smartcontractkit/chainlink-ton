import { toNano, Cell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { LogTypes } from '../../../wrappers/ccip/Logs'
import { assertLog } from '../../Logs'
import * as coverage from '../../coverage/coverage'
import { WRAPPED_NATIVE } from '../../../src/utils'

import * as rt from '../../../wrappers/ccip/Router'
import {
  setup,
  CHAINSEL_EVM_TEST_90000001,
  EVM_ADDRESS,
  contractsCoverageConfig,
} from './Router.Setup'

describe('Router', () => {
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
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: WRAPPED_NATIVE,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: 100n,
          allowOutOfOrderExecution: true,
        })
        .asCell(),
    }

    // Curse the lane
    {
      const result = await router.sendRMNRemoteCurse(deployer.getSender(), {
        value: toNano('1'),
        body: { queryID: 0n, subjects: [CHAINSEL_EVM_TEST_90000001] },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.Cursed, {
        subject: CHAINSEL_EVM_TEST_90000001,
      })

      await verifyNotCursed(router, deployer, false)
    }

    // Fail router.ccipSend
    {
      const result = await router.sendCcipSend(sender.getSender(), {
        value: toNano('1'),
        body: msg,
      })

      // we called the router
      expect(result.transactions).toHaveTransaction({
        from: sender.address,
        to: router.address,
        deploy: false,
        success: false,
        exitCode: rt.RouterError.SubjectCursed,
      })
    }

    // Uncurse the lane
    {
      const result = await router.sendRMNRemoteUncurse(deployer.getSender(), {
        value: toNano('1'),
        body: { queryID: 0n, subjects: [CHAINSEL_EVM_TEST_90000001] },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })

      assertLog(result.transactions, router.address, LogTypes.Uncursed, {
        subject: CHAINSEL_EVM_TEST_90000001,
      })

      await verifyNotCursed(router, deployer, true)
    }

    // Succeed router.ccipSend
    {
      const result = await router.sendCcipSend(sender.getSender(), {
        value: toNano('1'),
        body: msg,
      })

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
  expect(await router.getVerifyNotCursed(CHAINSEL_EVM_TEST_90000001)).toBe(expected)

  const verification = await router.sendRMNRemoteVerifyNotCursed(deployer.getSender(), {
    value: toNano('1'),
    body: { queryID: 0n, subject: CHAINSEL_EVM_TEST_90000001 },
  })
  expect(verification.transactions).toHaveTransaction({
    from: deployer.address,
    to: router.address,
    success: true,
  })
  expect(verification.transactions).toHaveTransaction({
    from: router.address,
    to: deployer.address,
    success: true,
    op: rt.opcodes.out.rmnRemoteVerifyNotCursedResponse,
    body(x) {
      if (!x) return false
      const resp = rt.builder.message.out.rmnRemoteVerifyNotCursedResponse.load(x.beginParse())
      return resp.queryID === 0n && resp.result === expected
    },
  })
}
