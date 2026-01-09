import { toNano, Cell, beginCell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/ccip/Router'
import * as or from '../../../wrappers/ccip/OnRamp'
import {
  setup,
  CHAINSEL_EVM_TEST_90000001,
  EVM_ADDRESS,
  TEST_TOKEN_ADDR,
  contractsCoverageConfig,
} from './Router.Setup'
import { ZERO_ADDRESS } from '../../../src/utils'

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

  const msg = {
    queryID: 1,
    destChainSelector: CHAINSEL_EVM_TEST_90000001,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: TEST_TOKEN_ADDR,
    extraArgs: rt.builder.data.extraArgs
      .encode({
        kind: 'generic-v2',
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      })
      .asCell(),
  }

  it('should forward getValidatedFee to OnRamp', async () => {
    const result = await router.sendGetValidatedFee(
      sender.getSender(),
      toNano('0.5'),
      msg,
      beginCell().asSlice(),
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      success: true,
      op: or.opcodes.in.getValidatedFee,
      body(x) {
        if (!x) return false
        const decoded = or.builder.messages.in.getValidatedFee.load(x.beginParse())
        return (
          decoded.msg.queryID === 1 &&
          decoded.msg.data.equals(Cell.EMPTY) &&
          decoded.msg.destChainSelector === CHAINSEL_EVM_TEST_90000001 &&
          decoded.msg.receiver.toString('hex') === EVM_ADDRESS.toString('hex') &&
          decoded.msg.tokenAmounts.length === 0 &&
          decoded.msg.feeToken.equals(TEST_TOKEN_ADDR)
        )
      },
    })
  })

  it('should reject getValidatedFee for disabled dest chain (missing OnRamp)', async () => {
    const badMsg = {
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST_90000001 + 1n,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: TEST_TOKEN_ADDR,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: 100n,
          allowOutOfOrderExecution: true,
        })
        .asCell(),
    }
    const result = await router.sendGetValidatedFee(
      sender.getSender(),
      toNano('0.5'),
      badMsg,
      beginCell().asSlice(),
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.messageValidationFailed,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.messageValidationFailed.load(x.beginParse())
        return decoded.error === BigInt(rt.RouterError.DestChainNotEnabled)
      },
    })
  })

  it('should reject getValidatedFee for disabled dest chain (zero address)', async () => {
    // Disable the onRamp for the chain
    {
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: 1n,
          onRamps: {
            destChainSelectors: [CHAINSEL_EVM_TEST_90000001],
            onRamp: undefined,
          },
        },
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    const badMsg = {
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: TEST_TOKEN_ADDR,
      extraArgs: rt.builder.data.extraArgs
        .encode({
          kind: 'generic-v2',
          gasLimit: 100n,
          allowOutOfOrderExecution: true,
        })
        .asCell(),
    }
    const result = await router.sendGetValidatedFee(
      sender.getSender(),
      toNano('0.5'),
      badMsg,
      beginCell().asSlice(),
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.messageValidationFailed,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.messageValidationFailed.load(x.beginParse())
        return decoded.error === BigInt(rt.RouterError.DestChainNotEnabled)
      },
    })
  })

  it('should forward messageValidated from OnRamp', async () => {
    const result = await router.sendMessageValidated(onRamp.getSender(), toNano('1'), {
      fee: toNano('0.5'),
      msg,
      context: {
        routerContext: sender.address,
        userContext: beginCell().asSlice(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.messageValidated,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.messageValidated.load(x.beginParse())
        return (
          decoded.fee === toNano('0.5') &&
          decoded.msg.queryID === 1 &&
          decoded.msg.data.equals(Cell.EMPTY) &&
          decoded.msg.destChainSelector === CHAINSEL_EVM_TEST_90000001 &&
          decoded.msg.receiver.toString('hex') === EVM_ADDRESS.toString('hex') &&
          decoded.msg.tokenAmounts.length === 0 &&
          decoded.msg.feeToken.equals(TEST_TOKEN_ADDR)
        )
      },
    })
  })

  it('should throw on messageValidated from non OnRamp', async () => {
    const result = await router.sendMessageValidated(sender.getSender(), toNano('1'), {
      fee: toNano('0.5'),
      msg,
      context: {
        routerContext: sender.address,
        userContext: beginCell().asSlice(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: false,
      exitCode: rt.RouterError.NotOnRamp,
    })
  })

  it('should forward messageValidationFailed from OnRamp', async () => {
    const result = await router.sendMessageValidationFailed(onRamp.getSender(), toNano('1'), {
      error: 12345n,
      msg,
      context: {
        routerContext: sender.address,
        userContext: beginCell().asSlice(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.messageValidationFailed,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.messageValidationFailed.load(x.beginParse())
        return (
          decoded.error === 12345n &&
          decoded.msg.queryID === 1 &&
          decoded.msg.data.equals(Cell.EMPTY) &&
          decoded.msg.destChainSelector === CHAINSEL_EVM_TEST_90000001 &&
          decoded.msg.receiver.toString('hex') === EVM_ADDRESS.toString('hex') &&
          decoded.msg.tokenAmounts.length === 0 &&
          decoded.msg.feeToken.equals(TEST_TOKEN_ADDR)
        )
      },
    })
  })

  it('should throw on messageValidationFailed from non OnRamp', async () => {
    const result = await router.sendMessageValidationFailed(sender.getSender(), toNano('1'), {
      error: 12345n,
      msg,
      context: {
        routerContext: sender.address,
        userContext: beginCell().asSlice(),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: false,
      exitCode: rt.RouterError.NotOnRamp,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_getFee',
        await contractsCoverageConfig(),
      )
    }
  })
})
