import { Address, beginCell, Cell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId, WRAPPED_NATIVE } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as ex from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as dep from '../../../wrappers/libraries/Deployable'
import { setup } from './OnRamp.Setup'
import { contractCode } from '../../../wrappers/codeLoader'
import { ChainSelectors } from '../../utils/Selectors'
import EVM_ADDRESS from '../../utils/evmAddress'
import * as cca from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { onrampSendCost } from '../../../wrappers/ccip/OnRamp'

describe('OnRamp - executor exit', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let senderAddress: Address
  let mockRouter: SandboxContract<TreasuryContract>
  let mockFeeQuoter: SandboxContract<TreasuryContract>
  let executorSender: Sender
  let executorAddress: Address
  let executorID: bigint

  const ccipSend = or.Router_CCIPSend.create({
    queryID: 1n,
    destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: WRAPPED_NATIVE,
    extraArgs: or.GenericExtraArgsV2.create({
      gasLimit: 100n,
      allowOutOfOrderExecution: true,
    }),
  })

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true
    blockchain.now = 1

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    senderAddress = (await blockchain.treasury('sender')).address
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')
    executorID = BigInt(generateRandomContractId())
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
    }))

    const resultUpdateDestChainConfigs = await onramp.sendOnRampUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('0.5'),
      {
        updates: [
          or.OnRampUpdateDestChainConfig.create({
            destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            router: mockRouter.address,
            allowlistEnabled: false,
          }),
        ],
      },
    )
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    const result = await onramp.sendOnRampSend(mockRouter.getSender(), onrampSendCost, {
      msg: ccipSend,
      metadata: or.Metadata.create({
        sender: senderAddress,
        value: toNano('42'),
      }),
    })

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      success: true,
      deploy: true,
      op: dep.opcodes.in.initializeAndSend,
    })

    const deployTX = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' && tx.inMessage.info.src.equals(onramp.address),
    )

    if (!deployTX) {
      throw new Error('Deploy transaction not found')
    }

    const deployedExecutorAddress = deployTX.inMessage?.info.dest

    if (!deployedExecutorAddress || !(deployedExecutorAddress instanceof Address)) {
      throw new Error('Executor address not found')
    }
    executorAddress = deployedExecutorAddress

    executorSender = blockchain.sender(executorAddress)
    // Read the initial data from the deploy message body itself (not the executor's
    // live storage): the real CCIPSendExecutor code now runs for real once deployed
    // and mutates its own storage as part of executing, so it no longer matches the
    // CCIPSendExecutor_InitialData layout by the time this hook returns.
    if (!deployTX.inMessage) {
      throw new Error('Deploy message not found')
    }
    const deployMessage = dep.builder.messages.in.initializeAndSend.load(
      deployTX.inMessage.body.beginParse(),
    )
    const storage = ex.CCIPSendExecutor_InitialData.fromSlice(
      deployMessage.stateInit.data.beginParse(),
    )
    executorID = storage.id
  })

  it('should return message sent to router', async () => {
    const nextSeqNum = await onramp.getExpectedNextSequenceNumber(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const result = await onramp.sendOnRampExecutorFinishedSuccessfully(
      executorSender,
      toNano('0.5'),
      {
        executorID: executorID,
        fee: or.Fee.create({
          feeTokenAmount: 1n,
          feeValueJuels: 1n,
        }),
        msg: ccipSend,
        metadata: or.Metadata.create({
          sender: senderAddress,
          value: 42n,
        }),
        tokenTransfer: or.OnRamp_ExecutorTokenTransfer.create({
          sourcePoolAddress: senderAddress,
          amount: 0n,
          destTokenAddress: cca.codec.encode(Buffer.alloc(0)).endCell().beginParse(),
          extraData: Cell.EMPTY,
          destExecData: Cell.EMPTY,
        }),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_MessageSent.PREFIX,
      body(x) {
        if (!x) return false
        const msgSent = rt.Router_MessageSent.fromSlice(x.beginParse())
        return (
          msgSent.sender.equals(senderAddress) && msgSent.queryID === BigInt(ccipSend.queryID ?? 0)
        )
      },
    })

    expect(
      await onramp.getExpectedNextSequenceNumber(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      ),
    ).toBe(nextSeqNum + 1n)
  })

  it('should return message rejected to router', async () => {
    const nextSeqNum = await onramp.getExpectedNextSequenceNumber(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const originalBalance = (await blockchain.getContract(onramp.address)).balance
    const refund = toNano('0.2')
    const result = await onramp.sendOnRampExecutorFinishedWithError(executorSender, toNano('0.5'), {
      executorID: executorID,
      queryID: ccipSend.queryID,
      destChainSelector: ccipSend.destChainSelector,
      sender: senderAddress,
      error: 42n,
      refund,
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_MessageRejected.PREFIX,
      // The reserved fee is refunded to the router on top of the remaining message value.
      value(x) {
        if (!x) return false
        return x > refund
      },
      body(x) {
        if (!x) return false
        const msgSent = rt.Router_MessageRejected.fromSlice(x.beginParse())
        return (
          msgSent.sender.equals(senderAddress) &&
          msgSent.queryID === BigInt(ccipSend.queryID ?? 0) &&
          msgSent.error === 42n
        )
      },
    })
    expect(
      await onramp.getExpectedNextSequenceNumber(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      ),
    ).toBe(nextSeqNum)

    const finalBalance = (await blockchain.getContract(onramp.address)).balance
    expect(finalBalance).toBe(originalBalance - refund)
  })

  describe('executor reserve fee', () => {
    it('should reserve the fee and confirm back to the executor', async () => {
      const fee = toNano('0.1')
      const onrampBalanceBefore = (await blockchain.getContract(onramp.address)).balance
      const executor = blockchain.openContract(ex.CCIPSendExecutor.fromAddress(executorAddress))

      // The mocked FeeQuoter replies with a validated fee, which makes the
      // executor request the fee reservation from the OnRamp.
      const result = await executor.sendFeeQuoterMessageValidatedAny(
        mockFeeQuoter.getSender(),
        toNano('0.3'),
        ex.FeeQuoter_MessageValidated.create({
          fee: ex.Fee.create({ feeTokenAmount: fee, feeValueJuels: fee }),
          msg: ccipSend,
          context: beginCell().asSlice(),
        }),
      )

      // The executor asks the OnRamp to reserve the validated fee...
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onramp.address,
        success: true,
        op: or.OnRamp_ExecutorReserveFee.PREFIX,
        body(x) {
          if (!x) return false
          const reserveFee = or.OnRamp_ExecutorReserveFee.fromSlice(x.beginParse())
          return reserveFee.fee === fee && reserveFee.executorID === executorID
        },
      })

      // ...the OnRamp confirms the reservation back to the executor...
      expect(result.transactions).toHaveTransaction({
        from: onramp.address,
        to: executorAddress,
        success: true,
        op: or.OnRamp_ExecutorFeeReserved.PREFIX,
        body(x) {
          if (!x) return false
          const confirmed = or.OnRamp_ExecutorFeeReserved.fromSlice(x.beginParse())
          return confirmed.executorID === executorID
        },
      })

      // ...and the executor completes the send (no token transfer).
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onramp.address,
        success: true,
        op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
      })

      // The reserved fee stays locked on the OnRamp: the balance grows by
      // exactly the fee amount (the emit and confirmation fees are paid from
      // the inbound message value, not from the stored balance).
      const onrampBalanceAfter = (await blockchain.getContract(onramp.address)).balance
      expect(onrampBalanceAfter).toBe(onrampBalanceBefore + fee)
    })

    it('should fail to reserve fee if sender is not the executor', async () => {
      const result = await onramp.sendOnRampExecutorReserveFee(
        deployer.getSender(),
        toNano('0.5'),
        {
          executorID: executorID,
          fee: toNano('0.3'),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: false,
        exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
      })
    })

    it('should fail to reserve fee if executorID is incorrect', async () => {
      const result = await onramp.sendOnRampExecutorReserveFee(executorSender, toNano('0.5'), {
        executorID: executorID + 1n, // incorrect ID
        fee: toNano('0.3'),
      })

      expect(result.transactions).toHaveTransaction({
        from: executorSender.address,
        to: onramp.address,
        success: false,
        exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
      })
    })

    it('should bounce the reservation when the attached value cannot cover the fee', async () => {
      // The executor attaches less than the fee it asks to reserve, so the
      // RAWRESERVE action fails in the action phase and the whole transaction is
      // reverted (RESERVE_MODE_BOUNCE_ON_ACTION_FAIL).
      const fee = toNano('1')
      const result = await onramp.sendOnRampExecutorReserveFee(executorSender, fee - 1n, {
        executorID: executorID,
        fee,
      })

      expect(result.transactions).toHaveTransaction({
        from: executorSender.address,
        to: onramp.address,
        success: false,
        aborted: true,
      })

      // No confirmation may be sent when the reservation failed.
      expect(result.transactions).not.toHaveTransaction({
        from: onramp.address,
        op: or.OnRamp_ExecutorFeeReserved.PREFIX,
      })
    })
  })

  it('should fail to send message sent if sender is not executor', async () => {
    const result = await onramp.sendOnRampExecutorFinishedSuccessfully(
      deployer.getSender(),
      toNano('0.5'),
      {
        executorID: executorID,
        fee: or.Fee.create({
          feeTokenAmount: 1n,
          feeValueJuels: 1n,
        }),
        msg: ccipSend,
        metadata: or.Metadata.create({
          sender: senderAddress,
          value: 42n,
        }),
        tokenTransfer: or.OnRamp_ExecutorTokenTransfer.create({
          sourcePoolAddress: senderAddress,
          amount: 0n,
          destTokenAddress: cca.codec.encode(Buffer.alloc(0)).endCell().beginParse(),
          extraData: Cell.EMPTY,
          destExecData: Cell.EMPTY,
        }),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
    })
  })

  it('should fail to send message rejected if executorID is incorrect', async () => {
    const result = await onramp.sendOnRampExecutorFinishedWithError(executorSender, toNano('3'), {
      executorID: executorID + 1n, // incorrect ID
      queryID: ccipSend.queryID,
      destChainSelector: ccipSend.destChainSelector,
      sender: senderAddress,
      error: 42n,
      refund: null,
    })

    expect(result.transactions).toHaveTransaction({
      from: executorSender.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
    })
  })

  it('should fail to send message rejected if sender is not executor', async () => {
    const result = await onramp.sendOnRampExecutorFinishedWithError(
      deployer.getSender(),
      toNano('0.5'),
      {
        executorID: executorID,
        queryID: ccipSend.queryID,
        destChainSelector: ccipSend.destChainSelector,
        sender: senderAddress,
        error: 42n,
        refund: null,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_executor_exit', [
        {
          code: await contractCode.ccip.local('OnRamp'),
          name: 'onramp',
        },
      ])
    }
  })
})
