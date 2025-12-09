import { Address, Cell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { compile } from '@ton/blueprint'

import { generateRandomContractId } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as relay from '../../../wrappers/test/mock/Relay'
import { CHAINSEL_EVM_TEST, deployOnRampContract, setup } from './OnRamp.Setup'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

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

  const ccipSend: rt.CCIPSend = {
    queryID: 1,
    destChainSelector: CHAINSEL_EVM_TEST,
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
    deployableCode = await compile('Deployable')
    senderAddress = (await blockchain.treasury('sender')).address
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')

    executorID = BigInt(generateRandomContractId())

    onramp = await deployOnRampContract(blockchain, deployer, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
      executor: {
        deployableCode: deployableCode,
        executorCode: await relay.ContractClient.code(),
        currentID: executorID,
      },
    })

    const resultUpdateDestChainConfigs = await onramp.sendUpdateDestChainConfigs(
      deployer.getSender(),
      {
        value: toNano('0.5'),
        destChainConfigs: [
          {
            destChainSelector: CHAINSEL_EVM_TEST,
            router: mockRouter.address,
            allowlistEnabled: false,
          },
        ],
      },
    )
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    const result = await onramp.sendSend(mockRouter.getSender(), toNano('1'), {
      msg: ccipSend,
      metadata: {
        sender: senderAddress,
        value: toNano('42'),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.opcodes.in.onrampSend,
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

    const relayContract = blockchain.openContract(
      relay.ContractClient.createFromAddress(executorAddress),
    )
    executorSender = await relayContract.getSender(deployer.getSender())
  })

  it('should return message sent to router', async () => {
    const nextSeqNum = await onramp.getExpectedNextSequenceNumber(CHAINSEL_EVM_TEST)
    const result = await onramp.sendExecutorFinishedSuccessfully(executorSender, {
      value: toNano('0.5'),
      body: {
        executorID: executorID,
        fee: {
          feeTokenAmount: 1n,
          feeValueJuels: 1n,
        },
        msg: ccipSend,
        metadata: {
          sender: senderAddress,
          value: 42n,
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.opcodes.in.messageSent,
      body(x) {
        if (!x) return false
        const msgSent = rt.builder.message.in.messageSent.load(x.beginParse())
        return (
          msgSent.sender.equals(senderAddress) && msgSent.queryID === BigInt(ccipSend.queryID ?? 0)
        )
      },
    })

    expect(await onramp.getExpectedNextSequenceNumber(CHAINSEL_EVM_TEST)).toBe(nextSeqNum + 1n)
  })

  it('should return message rejected to router', async () => {
    const nextSeqNum = await onramp.getExpectedNextSequenceNumber(CHAINSEL_EVM_TEST)
    const result = await onramp.sendExecutorFinishedWithError(executorSender, {
      value: toNano('0.5'),
      body: {
        executorID: executorID,
        error: 42n,
        msg: ccipSend,
        metadata: {
          sender: senderAddress,
          value: 42n,
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.opcodes.in.messageRejected,
      body(x) {
        if (!x) return false
        const msgSent = rt.builder.message.in.messageRejected.load(x.beginParse())
        return (
          msgSent.sender.equals(senderAddress) &&
          msgSent.queryID === BigInt(ccipSend.queryID ?? 0) &&
          msgSent.error === 42n
        )
      },
    })
    expect(await onramp.getExpectedNextSequenceNumber(CHAINSEL_EVM_TEST)).toBe(nextSeqNum)
  })

  it('should fail to send message sent if executorID is incorrect', async () => {
    const result = await onramp.sendExecutorFinishedSuccessfully(executorSender, {
      value: toNano('0.5'),
      body: {
        executorID: executorID + 1n, // incorrect ID
        fee: {
          feeTokenAmount: 1n,
          feeValueJuels: 1n,
        },
        msg: ccipSend,
        metadata: {
          sender: senderAddress,
          value: 42n,
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: executorSender.address,
      to: onramp.address,
      success: false,
      exitCode: or.Errors.Unauthorized,
    })
  })

  it('should fail to send message sent if sender is not executor', async () => {
    const result = await onramp.sendExecutorFinishedSuccessfully(deployer.getSender(), {
      value: toNano('0.5'),
      body: {
        executorID: executorID,
        fee: {
          feeTokenAmount: 1n,
          feeValueJuels: 1n,
        },
        msg: ccipSend,
        metadata: {
          sender: senderAddress,
          value: 42n,
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.Errors.Unauthorized,
    })
  })

  it('should fail to send message rejected if executorID is incorrect', async () => {
    const result = await onramp.sendExecutorFinishedWithError(executorSender, {
      value: toNano('0.5'),
      body: {
        executorID: executorID + 1n, // incorrect ID
        error: 42n,
        msg: ccipSend,
        metadata: {
          sender: senderAddress,
          value: 42n,
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: executorSender.address,
      to: onramp.address,
      success: false,
      exitCode: or.Errors.Unauthorized,
    })
  })

  it('should fail to send message rejected if sender is not executor', async () => {
    const result = await onramp.sendExecutorFinishedWithError(deployer.getSender(), {
      value: toNano('0.5'),
      body: {
        executorID: executorID,
        error: 42n,
        msg: ccipSend,
        metadata: {
          sender: senderAddress,
          value: 42n,
        },
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.Errors.Unauthorized,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_executor_exit', [
        {
          code: await onramp.getCode(),
          name: 'onramp',
        },
      ])
    }
  })
})
