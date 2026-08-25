import { Address, beginCell, Cell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId, WRAPPED_NATIVE } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as ex from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as dep from '../../../wrappers/libraries/Deployable'
import { setup } from './OnRamp.Setup'
import { getStorage } from '../../../wrappers/utils'
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
  let deployableCode: Cell
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

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    deployableCode = await contractCode.ccip.local('Deployable')
    senderAddress = (await blockchain.treasury('sender')).address
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')
    executorID = BigInt(generateRandomContractId())
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
      executor: {
        deployableCode: deployableCode,
        executorCode: Cell.EMPTY,
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
      tokenRegistry: null,
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

    const executorAddress = deployTX.inMessage?.info.dest

    if (!executorAddress || !(executorAddress instanceof Address)) {
      throw new Error('Executor address not found')
    }

    executorSender = blockchain.sender(executorAddress)

    const executorStorageCell = await getStorage(blockchain, executorAddress)
    const storage = ex.CCIPSendExecutor_InitialData.fromSlice(executorStorageCell.beginParse())
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
          extraData: beginCell().endCell(),
          destExecData: beginCell().endCell(),
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
    const result = await onramp.sendOnRampExecutorFinishedWithError(executorSender, toNano('0.5'), {
      executorID: executorID,
      error: 42n,
      msg: ccipSend,
      metadata: or.Metadata.create({
        sender: senderAddress,
        value: 42n,
      }),
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_MessageRejected.PREFIX,
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
          extraData: beginCell().endCell(),
          destExecData: beginCell().endCell(),
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
      error: 42n,
      msg: ccipSend,
      metadata: or.Metadata.create({
        sender: senderAddress,
        value: 42n,
      }),
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
        error: 42n,
        msg: ccipSend,
        metadata: or.Metadata.create({
          sender: senderAddress,
          value: 42n,
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
