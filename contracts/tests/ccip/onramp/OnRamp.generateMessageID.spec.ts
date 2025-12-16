import { Address, beginCell, Cell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { compile } from '@ton/blueprint'
import { sha256 } from '@ton/crypto'

import * as coverage from '../../coverage/coverage'
import { asSnakeData, generateRandomContractId } from '../../../src/utils'

import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as relay from '../../../wrappers/test/mock/Relay'
import { CHAINSEL_EVM_TEST, CHAINSEL_TON, deployOnRampContract, setup } from './OnRamp.Setup'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

describe('OnRamp - generate message id', () => {
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
    deployableCode = await compile('Deployable')
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
        executorCode: await relay.ContractClient.code(),
        currentID: executorID,
      },
    }))

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

  it('should generate same message id with same message', async () => {
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

    const expectedTVM2AnyRampMessage: or.TVM2AnyRampMessage = {
      header: {
        messageId: 0n,
        sourceChainSelector: CHAINSEL_TON,
        destChainSelector: CHAINSEL_EVM_TEST,
        sequenceNumber: 1n,
        nonce: 0n,
      },
      sender: senderAddress,
      body: {
        receiver: rt.builder.data.crossChainAddress.encode(ccipSend.receiver).asCell(),
        data: ccipSend.data,
        extraArgs: ccipSend.extraArgs,
        tokenAmounts: asSnakeData(ccipSend.tokenAmounts, rt.builder.data.tokenAmount.encode),
        feeToken: ccipSend.feeToken,
        feeTokenAmount: 1n,
      },
      feeValueJuels: 0n,
    }

    const identifierBuffer = await sha256('TVM2AnyMessageHashV1')
    const identifierInt = BigInt('0x' + identifierBuffer.toString('hex'))
    const metadataHash = BigInt(
      '0x' +
        beginCell()
          .storeUint(identifierInt, 256)
          .storeUint(expectedTVM2AnyRampMessage.header.sourceChainSelector, 64)
          .storeUint(expectedTVM2AnyRampMessage.header.destChainSelector, 64)
          .storeAddress(onramp.address)
          .endCell()
          .hash()
          .toString('hex'),
    )

    const LEAF_DOMAIN_SEPARATOR = beginCell().storeBuffer(Buffer.alloc(32)).asSlice()

    expectedTVM2AnyRampMessage.header.messageId = BigInt(
      '0x' +
        beginCell()
          .storeSlice(LEAF_DOMAIN_SEPARATOR)
          .storeUint(metadataHash, 256)
          .storeAddress(senderAddress)
          .storeUint(expectedTVM2AnyRampMessage.header.sequenceNumber, 64)
          .storeUint(expectedTVM2AnyRampMessage.header.nonce, 64)
          .storeRef(or.builder.data.tvm2AnyRampMessageBody.encode(expectedTVM2AnyRampMessage.body))
          .endCell()
          .hash()
          .toString('hex'),
    )

    expect(result.transactions).toHaveTransaction({
      from: executorSender.address,
      to: onramp.address,
      success: true,
      op: or.opcodes.in.executorFinishedSuccessfully,
    })

    for (const tx of result.transactions) {
      if (
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(executorSender.address!)
      ) {
        for (const msg of tx.outMessages.values()) {
          if (msg.info.type === 'external-out') {
            const event = or.builder.events.ccipMessageSent.load(msg.body.beginParse())
            if (event.message.header.messageId !== expectedTVM2AnyRampMessage.header.messageId) {
              expect(event.message.sender.equals(expectedTVM2AnyRampMessage.sender)).toBe(true)
              expect(
                rt.builder.data.crossChainAddress
                  .load(event.message.body.receiver.beginParse())
                  .toString('hex'),
              ).toBe(ccipSend.receiver.toString('hex'))
              expect(event.message.body.data.toString()).toBe(
                expectedTVM2AnyRampMessage.body.data.toString(),
              )
              expect(event.message.body.extraArgs.toString()).toBe(
                expectedTVM2AnyRampMessage.body.extraArgs.toString(),
              )
              expect(event.message.body.tokenAmounts.toString()).toBe(
                expectedTVM2AnyRampMessage.body.tokenAmounts.toString(),
              )
              expect(
                event.message.body.feeToken.equals(expectedTVM2AnyRampMessage.body.feeToken),
              ).toBe(true)
              expect(event.message.body.feeTokenAmount).toBe(
                expectedTVM2AnyRampMessage.body.feeTokenAmount,
              )
              expect(event.message.header.sourceChainSelector).toBe(
                expectedTVM2AnyRampMessage.header.sourceChainSelector,
              )
              expect(event.message.header.destChainSelector).toBe(
                expectedTVM2AnyRampMessage.header.destChainSelector,
              )
              expect(event.message.header.sequenceNumber).toBe(
                expectedTVM2AnyRampMessage.header.sequenceNumber,
              )
              expect(event.message.header.nonce).toBe(expectedTVM2AnyRampMessage.header.nonce)
              throw new Error(
                `Message ID does not match expected value: \nexpected: ${expectedTVM2AnyRampMessage.header.messageId}\nactual: ${event.message.header.messageId}`,
              )
            }
          }
        }
      }
    }
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_generate_message_id', [
        {
          code: await onramp.getCode(),
          name: 'onramp',
        },
      ])
    }
  })
})
