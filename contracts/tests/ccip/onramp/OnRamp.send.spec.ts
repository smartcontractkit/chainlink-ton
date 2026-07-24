import { Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { randomAddress } from '@ton/test-utils'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as sx from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as deployable from '../../../wrappers/libraries/Deployable'
import { setup } from './OnRamp.Setup'
import { WRAPPED_NATIVE } from '../../../src/utils'
import { contractCode } from '../../../wrappers/codeLoader'
import { ChainSelectors } from '../../utils/Selectors'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes

describe('OnRamp - Send', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let mockRouter: SandboxContract<TreasuryContract>
  let mockFeeQuoter: SandboxContract<TreasuryContract>
  let deployableCode: Cell
  let executorCode: Cell

  const senderAddress = randomAddress()
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

  const updateDestChainConfig = (allowlistEnabled: boolean) =>
    or.OnRampUpdateDestChainConfig.create({
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      router: mockRouter.address,
      allowlistEnabled,
    })

  const onRampSendBody = (msg: or.Router_CCIPSend = ccipSend) => ({
    msg,
    metadata: or.Metadata.create({
      sender: senderAddress,
      value: toNano('42'),
    }),
    tokenRegistry: null,
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
    mockRouter = await blockchain.treasury('mockRouter')
    mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')

    executorCode = Cell.EMPTY
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: mockFeeQuoter.address, // For now, fee quoter is global
      },
      executor: {
        executorCode,
      },
    }))

    const resultUpdateDestChainConfigs = await onramp.sendOnRampUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('0.5'),
      { updates: [updateDestChainConfig(false)] },
    )
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })
  })

  it('should deploy executor and forward message', async () => {
    const result = await onramp.sendOnRampSend(
      mockRouter.getSender(),
      toNano('1'),
      onRampSendBody(),
    )

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

    if (!deployTX.inMessage) {
      throw new Error('Deploy transaction has no input message')
    }

    expect(deployTX.inMessage?.body.beginParse().loadUint(32)).toBe(
      deployable.opcodes.in.initializeAndSend,
    )
    const msg = deployable.builder.messages.in.initializeAndSend.load(
      deployTX.inMessage?.body.beginParse(),
    )

    expect(msg.stateInit.code).toEqual(executorCode)
    expect(msg.selfMessage.body.beginParse().loadUint(32)).toBe(sx.CCIPSendExecutor_Execute.PREFIX)
    const selfMsg = sx.CCIPSendExecutor_Execute.fromSlice(msg.selfMessage.body.beginParse())
    expect(selfMsg.config.feeQuoter).toEqual(mockFeeQuoter.address)
    expect(selfMsg.onrampSend.metadata.sender).toEqual(senderAddress)
    expect(selfMsg.onrampSend.metadata.value).toBe(toNano('42'))
    expect(selfMsg.onrampSend.msg.destChainSelector).toBe(ccipSend.destChainSelector)
    expect(selfMsg.onrampSend.msg.feeToken).toEqual(ccipSend.feeToken)
    expect(selfMsg.onrampSend.msg.queryID).toBe(ccipSend.queryID)
    expect(CrossChainAddressCodec.ToBuffer(selfMsg.onrampSend.msg.receiver).toString('hex')).toBe(
      CrossChainAddressCodec.ToBuffer(ccipSend.receiver).toString('hex'),
    )
    expect(selfMsg.onrampSend.msg.tokenAmounts.length).toBe(0)
    expect(selfMsg.onrampSend.msg.data).toEqual(ccipSend.data)

    const executableData = sx.CCIPSendExecutor_InitialData.fromSlice(
      msg.stateInit.data.beginParse(),
    )
    expect(executableData.onramp).toEqual(onramp.address)
  })

  it('should fail if sender is not the router', async () => {
    const fakeRouter = await blockchain.treasury('fakeRouter')

    const result = await onramp.sendOnRampSend(
      fakeRouter.getSender(),
      toNano('1'),
      onRampSendBody(),
    )

    expect(result.transactions).toHaveTransaction({
      from: fakeRouter.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.Unauthorized'],
      op: or.OnRamp_Send.PREFIX,
    })
  })

  it('should succeed if allowlist is enabled and sender is allowed', async () => {
    // Update dest chain config to enable allowlist
    {
      const resultUpdateDestChainConfigs = await onramp.sendOnRampUpdateDestChainConfigs(
        deployer.getSender(),
        toNano('0.5'),
        { updates: [updateDestChainConfig(true)] },
      )
      expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: true,
      })

      const updateAllowlistsResult = await onramp.sendOnRampUpdateAllowlists(
        deployer.getSender(),
        toNano('0.5'),
        {
          updates: [
            or.UpdateAllowlist.create({
              destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
              add: [senderAddress],
              remove: [],
            }),
          ],
        },
      )
      expect(updateAllowlistsResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: true,
      })
    }

    const result = await onramp.sendOnRampSend(
      mockRouter.getSender(),
      toNano('1'),
      onRampSendBody(),
    )

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      success: true,
      op: deployable.opcodes.in.initializeAndSend,
    })
  })

  it('should fail if allowlist is enabled and sender is not allowed', async () => {
    // Update dest chain config to enable allowlist
    const resultUpdateDestChainConfigs = await onramp.sendOnRampUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('0.5'),
      { updates: [updateDestChainConfig(true)] },
    )
    expect(resultUpdateDestChainConfigs.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    const result = await onramp.sendOnRampSend(
      mockRouter.getSender(),
      toNano('1'),
      onRampSendBody(),
    )

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      success: true,
      op: rt.opcodes.in.messageRejected,
      body: (body) => {
        if (!body) return false
        const msg = rt.builder.message.in.messageRejected.load(body.beginParse())
        return (
          msg.destChainSelector === ccipSend.destChainSelector &&
          msg.sender.equals(senderAddress) &&
          msg.error === BigInt(or.OnRamp.Errors['OnRamp_Error.SenderNotAllowed'])
        )
      },
    })
  })

  it('should reject message if dest chain selector is unknown', async () => {
    const unknownChainCCIPSend = {
      ...ccipSend,
      destChainSelector: 0xdeadbeefn,
    }

    const result = await onramp.sendOnRampSend(
      mockRouter.getSender(),
      toNano('1'),
      onRampSendBody(unknownChainCCIPSend),
    )

    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.opcodes.in.messageRejected,
      body: (body) => {
        if (!body) return false
        const msg = rt.builder.message.in.messageRejected.load(body.beginParse())
        return (
          msg.destChainSelector === unknownChainCCIPSend.destChainSelector &&
          msg.sender.equals(senderAddress) &&
          msg.error === BigInt(or.OnRamp.Errors['OnRamp_Error.UnknownDestChainSelector'])
        )
      },
    })
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
