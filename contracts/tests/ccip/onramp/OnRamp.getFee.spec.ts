import { Address, beginCell, Cell, Message, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import { CHAINSEL_EVM_TEST_90000002, deployOnRampContract, setup } from './OnRamp.Setup'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

describe('OnRamp - Get Fee', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let mockRouter: SandboxContract<TreasuryContract>
  let mockFeeQuoter: SandboxContract<TreasuryContract>

  const ccipSend: rt.CCIPSend = {
    queryID: 1,
    destChainSelector: CHAINSEL_EVM_TEST_90000002,
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
    ;({ deployer } = await setup(blockchain))
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')

    onramp = await deployOnRampContract(blockchain, deployer, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
    })
  })

  it('should get feequoter offchain', async () => {
    // This is required to get fee off-chain
    // 1. get onramp address from router
    // 2. get fee quoter address from onramp <=
    // 3. get validated fee from fee quoter

    const queriedFeeQuoter = await onramp.getFeeQuoter(CHAINSEL_EVM_TEST_90000002) // We don't validate chain selector here yet. We might enable different fee quoters per chain later.
    expect(queriedFeeQuoter.equals(mockFeeQuoter.address)).toBe(true)
  })

  it('should forward get fee to fee quoter', async () => {
    const result = await onramp.sendGetValidatedFee(mockRouter.getSender(), {
      value: toNano('0.5'),
      msg: ccipSend,
      context: beginCell().storeUint(42, 32).endCell(), // arbitrary context
    })

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.opcodes.in.getValidatedFee,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockFeeQuoter.address,
      op: fq.Opcodes.getValidatedFee,
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
    expect(outMsg.body.beginParse().loadUint(32)).toBe(fq.Opcodes.getValidatedFee)
    const decoded = fq.builder.message.in.getValidatedFee.load(outMsg.body.beginParse())
    expect(decoded.msg).toEqual(ccipSend)
  })

  it('should throw error if message validated comes from non-feequoter', async () => {
    const anotherSender = await blockchain.treasury('anotherSender')
    const result = await onramp.sendMessageValidated(anotherSender.getSender(), {
      value: toNano('0.5'),
      body: {
        fee: {
          feeTokenAmount: 123456n,
          feeValueJuels: 12345n,
        },
        msg: ccipSend,
        context: {
          onrampContext: mockRouter.address,
          userContext: beginCell().storeUint(42, 32).asSlice(), // arbitrary context
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: anotherSender.address,
      to: onramp.address,
      success: false,
      op: or.opcodes.in.messageValidated,
      exitCode: or.Errors.Unauthorized,
    })
  })

  it('should forward message validated', async () => {
    const result = await onramp.sendMessageValidated(mockFeeQuoter.getSender(), {
      value: toNano('0.5'),
      body: {
        fee: {
          feeTokenAmount: 123456n,
          feeValueJuels: 12345n,
        },
        msg: ccipSend,
        context: {
          onrampContext: mockRouter.address,
          userContext: beginCell().storeUint(42, 32).asSlice(), // arbitrary context
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: mockFeeQuoter.address,
      to: onramp.address,
      success: true,
      op: or.opcodes.in.messageValidated,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      op: or.opcodes.out.messageValidated,
    })
  })

  it('should forward message validation failed', async () => {
    const validationFailedMsg = {
      error: 123n,
      msg: ccipSend,
      context: {
        onrampContext: mockRouter.address,
        userContext: beginCell().storeUint(42, 32).asSlice(),
      },
    }
    const result = await onramp.sendMessageValidationFailed(mockFeeQuoter.getSender(), {
      value: toNano('0.5'),
      body: validationFailedMsg,
    })

    expect(result.transactions).toHaveTransaction({
      from: mockFeeQuoter.address,
      to: onramp.address,
      success: true,
      op: or.opcodes.in.messageValidationFailed,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      op: or.opcodes.out.messageValidationFailed,
      body: or.builder.messages.out.messageValidationFailed
        .encode({
          error: validationFailedMsg.error,
          msg: validationFailedMsg.msg,
          context: validationFailedMsg.context.userContext,
        })
        .asCell(),
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_get_fee', [
        {
          code: await onramp.getCode(),
          name: 'onramp',
        },
      ])
    }
  })
})
