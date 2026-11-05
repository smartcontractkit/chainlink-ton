import { Address, beginCell, Cell, Message, toNano } from '@ton/core'
import { Blockchain, internal, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import { contractCode } from '../../../wrappers/codeLoader'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import { setup } from './OnRamp.Setup'
import * as bouncer from '../../../wrappers/test/mock/Bouncer'
import { NATIVE_GRAM } from '../../../src/utils'
import { ChainFamilySelectors, ChainSelectors } from '../../utils/Selectors'
import EVM_ADDRESS from '../../utils/evmAddress'

describe('OnRamp - Get Fee', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let mockRouter: SandboxContract<TreasuryContract>
  let mockFeeQuoter: SandboxContract<TreasuryContract>

  const ccipSend = or.Router_CCIPSend.create({
    queryID: 1n,
    destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: NATIVE_GRAM,
    extraArgs: or.GenericExtraArgsV2.create({
      gasLimit: 100n,
      allowOutOfOrderExecution: true,
    }),
  })

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
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
    }))
  })

  it('should get feequoter offchain', async () => {
    // This is required to get fee off-chain
    // 1. get onramp address from router
    // 2. get fee quoter address from onramp <=
    // 3. get validated fee from fee quoter

    const queriedFeeQuoter = await onramp.getFeeQuoter(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
    ) // We don't validate chain selector here yet. We might enable different fee quoters per chain later.
    expect(queriedFeeQuoter).toEqual(mockFeeQuoter.address)
  })

  it('should forward get fee to fee quoter', async () => {
    const result = await onramp.sendOnRampGetValidatedFee(
      mockRouter.getSender(),
      toNano('0.5'),
      or.OnRamp_GetValidatedFee.create({
        ccipSend,
        context: beginCell().storeUint(42, 32).endCell(), // arbitrary context
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_GetValidatedFee.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockFeeQuoter.address,
      op: fq.FeeQuoter_GetValidatedFee.PREFIX,
    })

    const tx = result.transactions.find(
      (tx) =>
        tx.inMessage &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(mockRouter.address) &&
        tx.inMessage.info.dest instanceof Address &&
        tx.inMessage.info.dest.equals(onramp.address),
    )
    if (!tx) {
      throw new Error('Cannot find outgoing message from OnRamp to FeeQuoter')
    }
    if (tx.outMessages.values().length !== 1) {
      throw new Error('Unexpected number of out messages: ' + tx.outMessages.values().length)
    }
    const outMsg: Message = tx.outMessages.values()[0]
    if (outMsg.info.type !== 'internal') {
      throw new Error('Unexpected message type')
    }
    const body = outMsg.body.beginParse()
    expect(body.loadUint(32)).toBe(fq.FeeQuoter_GetValidatedFee.PREFIX)
    const decoded = fq.Router_CCIPSend.fromSlice(body.loadRef().beginParse())
    expect(decoded.queryID).toBe(ccipSend.queryID)
    expect(decoded.destChainSelector).toBe(ccipSend.destChainSelector)
    expect(decoded.feeToken).toEqual(ccipSend.feeToken)
  })

  it('should reply MessageValidationFailed with the exit code when the FeeQuoter bounces', async () => {
    const feeQuoterBouncer = blockchain.openContract(
      bouncer.ContractClient.createFromConfig(await contractCode.ccip.local('tests.mock.Bouncer')),
    )
    await feeQuoterBouncer.sendDeploy(deployer.getSender(), toNano('0.05'))
    ;({ deployer, onramp } = await setup(blockchain, {
      config: { feeQuoter: feeQuoterBouncer.address },
    }))
    const userContext = beginCell().storeUint(42, 32).endCell()

    const result = await onramp.sendOnRampGetValidatedFee(
      mockRouter.getSender(),
      toNano('0.5'),
      or.OnRamp_GetValidatedFee.create({ ccipSend, context: userContext }),
    )

    expect(result.transactions).toHaveTransaction({
      from: feeQuoterBouncer.address,
      to: onramp.address,
      op: 0xfffffffe,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: or.OnRamp_MessageValidationFailed.PREFIX,
      body(x) {
        if (!x) return false
        const failed = or.OnRamp_MessageValidationFailed.fromSlice(x.beginParse())
        return (
          failed.errorCode === 0xffffn && // the Bouncer throws 0xFFFF
          failed.msg.queryID === ccipSend.queryID &&
          failed.context !== null &&
          failed.context.equals(userContext)
        )
      },
    })
  })

  it('should throw on a legacy bounce other than the fee withdrawal', async () => {
    // Every OnRamp send except the fee withdrawal is RichBounce or NoBounce, so a legacy bounce
    // with a non-empty body is unexpected.
    const result = await blockchain.sendMessage(
      internal({
        from: mockFeeQuoter.address,
        to: onramp.address,
        value: toNano('0.1'),
        bounced: true,
        body: beginCell().storeUint(0xffffffff, 32).storeUint(0x5eee82b8, 32).endCell(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: mockFeeQuoter.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.UnhandledLegacyBounce'],
    })
  })

  it('should throw error if message validated comes from non-feequoter', async () => {
    const anotherSender = await blockchain.treasury('anotherSender')
    const result = await onramp.sendFeeQuoterMessageValidated(
      anotherSender.getSender(),
      toNano('0.5'),
      or.FeeQuoter_MessageValidated.create({
        fee: or.Fee.create({
          feeTokenAmount: 123456n,
          feeValueJuels: 12345n,
        }),
        destOverheads: [],
        chainFamilySelector: ChainFamilySelectors.evm,
        msg: ccipSend,
        context: or.OnRamp_GetValidatedFeeContext.toCell(
          or.OnRamp_GetValidatedFeeContext.create({
            onrampContext: mockRouter.address,
            userContext: beginCell().storeUint(42, 32).endCell(), // arbitrary context
          }),
        ),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: anotherSender.address,
      to: onramp.address,
      success: false,
      op: or.FeeQuoter_MessageValidated.PREFIX,
      exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
    })
  })

  it('should forward message validated', async () => {
    const result = await onramp.sendFeeQuoterMessageValidated(
      mockFeeQuoter.getSender(),
      toNano('0.5'),
      or.FeeQuoter_MessageValidated.create({
        fee: or.Fee.create({
          feeTokenAmount: 123456n,
          feeValueJuels: 12345n,
        }),
        destOverheads: [],
        chainFamilySelector: ChainFamilySelectors.evm,
        msg: ccipSend,
        context: or.OnRamp_GetValidatedFeeContext.toCell(
          or.OnRamp_GetValidatedFeeContext.create({
            onrampContext: mockRouter.address,
            userContext: beginCell().storeUint(42, 32).endCell(), // arbitrary context
          }),
        ),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: mockFeeQuoter.address,
      to: onramp.address,
      success: true,
      op: or.FeeQuoter_MessageValidated.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      op: or.OnRamp_MessageValidated.PREFIX,
    })
  })

  it('should forward message validation failed', async () => {
    const validationFailedMsg = or.FeeQuoter_MessageValidationFailed.create({
      errorCode: 123n,
      msg: ccipSend,
      context: or.OnRamp_GetValidatedFeeContext.toCell(
        or.OnRamp_GetValidatedFeeContext.create({
          onrampContext: mockRouter.address,
          userContext: beginCell().storeUint(42, 32).endCell(), // arbitrary context
        }),
      ),
    })
    const result = await onramp.sendFeeQuoterMessageValidationFailed(
      mockFeeQuoter.getSender(),
      toNano('0.5'),
      validationFailedMsg,
    )

    expect(result.transactions).toHaveTransaction({
      from: mockFeeQuoter.address,
      to: onramp.address,
      success: true,
      op: or.FeeQuoter_MessageValidationFailed.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      op: or.OnRamp_MessageValidationFailed.PREFIX,
      body: (body) => {
        if (!body) return false
        const decoded = or.OnRamp_MessageValidationFailed.fromSlice(body.beginParse())
        return (
          decoded.errorCode === validationFailedMsg.errorCode &&
          decoded.msg.queryID === ccipSend.queryID
        )
      },
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_get_fee', [
        {
          code: await contractCode.ccip.local('OnRamp'),
          name: 'onramp',
        },
      ])
    }
  })
})
