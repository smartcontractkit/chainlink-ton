import { toNano, Cell, beginCell, Builder, Slice } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { asSnakeDataUint, fromSnakeData, WRAPPED_NATIVE } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as or from '../../../wrappers/ccip/OnRamp'
import {
  setup,
  CHAINSEL_EVM_TEST_90000001,
  EVM_ADDRESS,
  contractsCoverageConfig,
} from './Router.Setup'
import { setupGenBindings } from '../../../wrappers/gen'

const EVM_CC_ADDRESS: rt.CrossChainAddress = beginCell().storeBuffer(EVM_ADDRESS).asSlice()

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    setupGenBindings()

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
    const res = await setup(blockchain, { feeQuoter, onRamp })
    ;({ deployer, sender } = res)
    router = blockchain.openContract(rt.Router.fromAddress(res.router.address))
  })

  const ccipSend = rt.Router_CCIPSend.create({
    queryID: 1n,
    destChainSelector: CHAINSEL_EVM_TEST_90000001,
    receiver: EVM_CC_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: beginCell().endCell(),
    feeToken: WRAPPED_NATIVE,
    extraArgs: {
      ref: rt.GenericExtraArgsV2.create({
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      }),
    },
  })
  const msg: rt.CellRef<rt.Router_CCIPSend> = {
    ref: ccipSend,
  }

  it('should forward getValidatedFee to OnRamp', async () => {
    const result = await router.sendRouterGetValidatedFeeRemainingBitsAndRefs(
      sender.getSender(),
      toNano('0.5'),
      {
        $: 'Router_GetValidatedFee',
        ccipSend: msg,
        context: beginCell().asSlice(),
      },
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
          decoded.msg.feeToken!.equals(WRAPPED_NATIVE)
        )
      },
    })
  })

  it('should reject getValidatedFee for disabled dest chain (missing OnRamp)', async () => {
    const badMsg: rt.CellRef<rt.Router_CCIPSend> = {
      ref: {
        $: 'Router_CCIPSend',
        queryID: 1n,
        destChainSelector: CHAINSEL_EVM_TEST_90000001 + 1n,
        receiver: beginCell().storeBuffer(EVM_ADDRESS).asSlice(),
        data: Cell.EMPTY,
        tokenAmounts: beginCell().endCell(),
        feeToken: WRAPPED_NATIVE,
        extraArgs: {
          ref: rt.GenericExtraArgsV2.create({
            gasLimit: 100n,
            allowOutOfOrderExecution: true,
          }),
        },
      },
    }
    const result = await router.sendRouterGetValidatedFeeRemainingBitsAndRefs(
      sender.getSender(),
      toNano('0.5'),
      {
        $: 'Router_GetValidatedFee',
        ccipSend: badMsg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_MessageValidationFailed.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_MessageValidationFailed_RemainingBitsAndRefs.fromSlice(
          x.beginParse(),
        )
        return decoded.error === BigInt(rt.Router.Errors['Router_Error.DestChainNotEnabled'])
      },
    })
  })

  it('should reject getValidatedFee for disabled dest chain (zero address)', async () => {
    // Disable the onRamp for the chain
    {
      const result = await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('1'), {
        queryId: 1n,
        onRampUpdates: {
          $: 'OnRamps',
          destChainSelectors: asSnakeDataUint([CHAINSEL_EVM_TEST_90000001], 64),
          onRamp: null,
        },
        offRampAdds: null,
        offRampRemoves: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    const badMsg: rt.CellRef<rt.Router_CCIPSend> = {
      ref: {
        $: 'Router_CCIPSend',
        queryID: 1n,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        receiver: EVM_CC_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: beginCell().endCell(),
        feeToken: WRAPPED_NATIVE,
        extraArgs: {
          ref: rt.GenericExtraArgsV2.create({
            gasLimit: 100n,
            allowOutOfOrderExecution: true,
          }),
        },
      },
    }
    const result = await router.sendRouterGetValidatedFeeRemainingBitsAndRefs(
      sender.getSender(),
      toNano('0.5'),
      {
        $: 'Router_GetValidatedFee',
        ccipSend: badMsg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_MessageValidationFailed.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_MessageValidationFailed_RemainingBitsAndRefs.fromSlice(
          x.beginParse(),
        )
        return decoded.error === BigInt(rt.Router.Errors['Router_Error.DestChainNotEnabled'])
      },
    })
  })

  it('should forward messageValidated from OnRamp', async () => {
    const result = await router.sendOnRampMessageValidatedGetValidatedFeeContext(
      onRamp.getSender(),
      toNano('1'),
      {
        $: 'OnRamp_MessageValidated',
        fee: toNano('0.5'),
        msg,
        context: rt.Router_GetValidatedFeeContext.create({
          routerContext: sender.address,
          userContext: beginCell().asSlice(),
        }),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_MessageValidated.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_MessageValidated_RemainingBitsAndRefs.fromSlice(x.beginParse())
        return (
          decoded.fee === toNano('0.5') &&
          decoded.msg.ref.queryID === 1n &&
          decoded.msg.ref.data.equals(Cell.EMPTY) &&
          decoded.msg.ref.destChainSelector === CHAINSEL_EVM_TEST_90000001 &&
          decoded.msg.ref.receiver.asCell().equals(EVM_CC_ADDRESS.asCell()) &&
          fromSnakeData(decoded.msg.ref.tokenAmounts, rt.TokenAmount.fromSlice).length === 0 &&
          decoded.msg.ref.feeToken!.equals(WRAPPED_NATIVE)
        )
      },
    })
  })

  it('should throw on messageValidated from non OnRamp', async () => {
    const result = await router.sendOnRampMessageValidatedGetValidatedFeeContext(
      sender.getSender(),
      toNano('1'),
      {
        $: 'OnRamp_MessageValidated',
        fee: toNano('0.5'),
        msg,
        context: rt.Router_GetValidatedFeeContext.create({
          routerContext: sender.address,
          userContext: beginCell().asSlice(),
        }),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.NotOnRamp'],
    })
  })

  it('should forward messageValidationFailed from OnRamp', async () => {
    const result = await router.sendOnRampMessageValidationFailedGetValidatedFeeContext(
      onRamp.getSender(),
      toNano('1'),
      {
        $: 'OnRamp_MessageValidationFailed',
        error: 12345n,
        msg,
        context: rt.Router_GetValidatedFeeContext.create({
          routerContext: sender.address,
          userContext: beginCell().asSlice(),
        }),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_MessageValidationFailed.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_MessageValidationFailed_RemainingBitsAndRefs.fromSlice(
          x.beginParse(),
        )
        return (
          decoded.error === 12345n &&
          decoded.msg.ref.queryID === 1n &&
          decoded.msg.ref.data.equals(Cell.EMPTY) &&
          decoded.msg.ref.destChainSelector === CHAINSEL_EVM_TEST_90000001 &&
          decoded.msg.ref.receiver.asCell().equals(EVM_CC_ADDRESS.asCell()) &&
          fromSnakeData(decoded.msg.ref.tokenAmounts, rt.TokenAmount.fromSlice).length === 0 &&
          decoded.msg.ref.feeToken!.equals(WRAPPED_NATIVE)
        )
      },
    })
  })

  it('should throw on messageValidationFailed from non OnRamp', async () => {
    const result = await router.sendOnRampMessageValidationFailedGetValidatedFeeContext(
      sender.getSender(),
      toNano('1'),
      {
        $: 'OnRamp_MessageValidationFailed',
        error: 12345n,
        msg,
        context: rt.Router_GetValidatedFeeContext.create({
          routerContext: sender.address,
          userContext: beginCell().asSlice(),
        }),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.NotOnRamp'],
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
