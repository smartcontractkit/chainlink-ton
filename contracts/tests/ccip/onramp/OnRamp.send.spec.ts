import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import * as deployable from '../../../wrappers/libraries/Deployable'
import * as relay from '../../../wrappers/test/mock/Relay'
import * as coverage from '../../coverage/coverage'

import { Address, beginCell, Cell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { CHAINSEL_EVM_TEST, CHAINSEL_TON, deployOnRampContract, setup } from './OnRamp.Setup'
import { compile } from '@ton/blueprint'
import { sha256 } from '@ton/crypto'
import { asSnakeData, generateRandomContractId } from '../../../src/utils'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

describe('OnRamp - Send', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let senderAddress: Address
  let mockRouter: SandboxContract<TreasuryContract>
  let mockFeeQuoter: SandboxContract<TreasuryContract>
  let deployableCode: Cell
  let executorCode: Cell

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

  beforeEach(async () => {
    ;({ blockchain, deployer } = await setup())
    deployableCode = await compile('Deployable')
    senderAddress = (await blockchain.treasury('sender')).address
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')

    executorCode = Cell.EMPTY
    onramp = await deployOnRampContract(blockchain, deployer, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
      executor: {
        executorCode,
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
  })

  it('should deploy executor and forward message', async () => {
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
      op: or.Opcodes.onrampSend,
    })

    const deployTX = result.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' && tx.inMessage.info.src.equals(onramp.address),
    )

    if (!deployTX) {
      throw new Error('Deploy transaction not found')
    }

    if (!deployTX.inMessage) {
      throw new Error('Deploy transaction has no input message')
    }

    expect(deployTX.inMessage?.body.beginParse().loadUint(32)).toBe(
      deployable.Opcodes.initializeAndSend,
    )
    const msg = deployable.builder.messages.in.initializeAndSend.load(
      deployTX.inMessage?.body.beginParse(),
    )

    expect(msg.stateInit.code.equals(executorCode)).toBe(true)
    expect(msg.selfMessage.body.beginParse().loadUint(32)).toBe(sx.Opcodes.execute)
    const selfMsg = sx.builder.message.in.execute.load(msg.selfMessage.body.beginParse())
    expect(selfMsg.config.feeQuoter.equals(mockFeeQuoter.address)).toBe(true)
    expect(selfMsg.onrampSend.metadata.sender.equals(senderAddress)).toBe(true)
    expect(selfMsg.onrampSend.metadata.value).toBe(toNano('42'))
    expect(selfMsg.onrampSend.msg.destChainSelector).toBe(ccipSend.destChainSelector)
    expect(selfMsg.onrampSend.msg.feeToken.equals(ccipSend.feeToken)).toBe(true)
    expect(selfMsg.onrampSend.msg.queryID).toBe(ccipSend.queryID)
    expect(selfMsg.onrampSend.msg.receiver.toString('hex')).toBe(ccipSend.receiver.toString('hex'))
    expect(selfMsg.onrampSend.msg.tokenAmounts.length).toBe(0)
    expect(selfMsg.onrampSend.msg.data.equals(ccipSend.data)).toBe(true)

    const executableData = sx.builder.data.contractInitData.load(msg.stateInit.data.beginParse())
    expect(executableData.onramp.equals(onramp.address)).toBe(true)
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
