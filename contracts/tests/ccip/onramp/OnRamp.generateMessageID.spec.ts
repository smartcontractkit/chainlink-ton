import { Address, beginCell, Cell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import { WRAPPED_NATIVE } from '../../../src/utils'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as executor from '../../../wrappers/ccip/CCIPSendExecutor'
import * as relay from '../../../wrappers/test/mock/Relay'
import { setup } from './OnRamp.Setup'
import { contractCode } from '../../../wrappers/codeLoader'
import { ChainSelectors } from '../../utils/Selectors'
import * as on from '../../../wrappers/gen/ccip/OnRamp'
import generateMessageID, { getMetadataHash } from '../../../src/onramp/generateMessageID'
import * as tmh from '../../../wrappers/gen/test/TestMsgHasher'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes

describe('OnRamp - generate message id', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let msgHasher: SandboxContract<tmh.TestMsgHasher>
  let senderAddress: Address
  let mockRouter: SandboxContract<TreasuryContract>
  let mockFeeQuoter: SandboxContract<TreasuryContract>
  let executorSender: Sender
  let deployableCode: Cell
  let executorID: bigint

  const ccipSend = or.Router_CCIPSend.create({
    queryID: 1n,
    destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    receiver: CrossChainAddressCodec.FromBuffer(EVM_ADDRESS),
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

    // TestMsgHasher is stateless and deploys to a deterministic address, so it only
    // needs to be deployed once for the whole suite.
    const deployerTreasury = await blockchain.treasury('msgHasherDeployer')
    msgHasher = blockchain.openContract(tmh.TestMsgHasher.fromStorage({}))
    const resultDeployMsgHasher = await msgHasher.sendDeploy(
      deployerTreasury.getSender(),
      toNano('0.2'),
    )
    expect(resultDeployMsgHasher.transactions).toHaveTransaction({
      from: deployerTreasury.address,
      to: msgHasher.address,
      deploy: true,
      success: true,
    })
  })

  beforeEach(async () => {
    deployableCode = await contractCode.ccip.local('Deployable')
    senderAddress = (await blockchain.treasury('sender')).address
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
      executor: {
        deployableCode: deployableCode,
        executorCode: await relay.ContractClient.code(),
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

    const result = await onramp.sendOnRampSend(mockRouter.getSender(), toNano('1'), {
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

    const executorStorageCell = await relayContract.getStorage()
    const storage = executor.builder.data.contractInitData.load(executorStorageCell.beginParse())
    executorID = storage.id
  })

  it('should generate same message id with same message', async () => {
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
      },
    )

    const expectedTVM2AnyRampMessage = on.TVM2AnyRampMessage.create({
      header: on.RampMessageHeader.create({
        messageId: 0n,
        sourceChainSelector: ChainSelectors.testnet.ton,
        destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        nonce: 0n,
      }),
      sender: senderAddress,
      body: on.TVM2AnyRampMessageBody.create({
        receiver: ccipSend.receiver,
        data: ccipSend.data,
        extraArgs: ccipSend.extraArgs,
        tokenAmounts: ccipSend.tokenAmounts,
        feeToken: ccipSend.feeToken!,
        feeTokenAmount: 1n,
      }),
      feeValueJuels: 0n,
    })

    const metadataHash = getMetadataHash(
      expectedTVM2AnyRampMessage.header.sourceChainSelector,
      expectedTVM2AnyRampMessage.header.destChainSelector,
      onramp.address,
    )

    // Local TypeScript calculation, independent of the contract
    const localMessageId = generateMessageID(expectedTVM2AnyRampMessage, metadataHash)

    // On-chain calculation via the real Tolk implementation
    const onChainMessageId = await msgHasher.getTVM2AnyRampMessageID(
      tmh.TVM2AnyRampMessage.create({
        header: expectedTVM2AnyRampMessage.header,
        sender: expectedTVM2AnyRampMessage.sender,
        body: expectedTVM2AnyRampMessage.body,
        feeValueJuels: expectedTVM2AnyRampMessage.feeValueJuels,
      }),
      metadataHash,
    )

    expect(onChainMessageId).toBe(localMessageId)

    expectedTVM2AnyRampMessage.header.messageId = localMessageId

    expect(result.transactions).toHaveTransaction({
      from: executorSender.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
    })

    for (const tx of result.transactions) {
      if (
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(executorSender.address!)
      ) {
        for (const msg of tx.outMessages.values()) {
          if (msg.info.type === 'external-out') {
            const event = or.CCIPMessageSent.fromSlice(msg.body.beginParse())
            if (event.message.header.messageId !== expectedTVM2AnyRampMessage.header.messageId) {
              expect(event.message.sender).toEqual(expectedTVM2AnyRampMessage.sender)
              expect(
                CrossChainAddressCodec.ToBuffer(event.message.body.receiver).toString('hex'),
              ).toBe(CrossChainAddressCodec.ToBuffer(ccipSend.receiver).toString('hex'))
              expect(event.message.body.data).toEqual(expectedTVM2AnyRampMessage.body.data)
              expect(event.message.body.extraArgs).toEqual(
                expectedTVM2AnyRampMessage.body.extraArgs,
              )
              expect(event.message.body.tokenAmounts).toEqual(
                expectedTVM2AnyRampMessage.body.tokenAmounts,
              )
              expect(event.message.body.feeToken).toEqual(expectedTVM2AnyRampMessage.body.feeToken)
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

  it('getMetadataHash matches the on-chain msg_hasher implementation', async () => {
    const sourceChainSelector = ChainSelectors.testnet.ton
    const destChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

    // Local TypeScript calculation, independent of the contract
    const localMetadataHash = getMetadataHash(
      sourceChainSelector,
      destChainSelector,
      onramp.address,
    )

    // On-chain calculation via the real Tolk implementation (msg_hasher.tolk wraps
    // TVM2AnyRampMessageV1Metadata from ccip/onramp/types.tolk)
    const onChainMetadataHash = await msgHasher.getTVM2AnyV1MetadataHash(
      sourceChainSelector,
      destChainSelector,
      onramp.address,
    )

    expect(onChainMetadataHash).toBe(localMetadataHash)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_generate_message_id', [
        {
          code: await contractCode.ccip.local('OnRamp'),
          name: 'onramp',
        },
      ])
    }
  })
})
