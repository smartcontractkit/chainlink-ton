import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { compile } from '@ton/blueprint'
import { beginCell, toNano } from '@ton/core'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { errorCode, facilityId } from '../../../wrappers/utils'
import { CHAINSEL_EVM_TEST_90000001, EVM_ADDRESS } from '../router/Router.Setup'
import { WRAPPED_NATIVE } from '../../../src/utils'

import { setup as ccipSendExecutor, sendDeployOnBlockchain, setup } from './SendExecutor.Setup'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as bouncer from '../../../wrappers/test/mock/Bouncer'

describe('SendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: sx.ContractClient.type(),
    version: sx.ContractClient.version(),
    deployContract: async (
      blockchain: Blockchain,
      deployer: SandboxContract<TreasuryContract>,
    ): Promise<SandboxContract<sx.ContractClient>> => {
      const deployable = await ccipSendExecutor(blockchain, deployer)
      return sendDeployOnBlockchain(blockchain, deployer, deployable, undefined, deployer).then(
        ({ sendExecutor }) => sendExecutor,
      )
    },
  })
  currentVersionSpec.run([
    {
      code: 'CCIPSendExecutor',
      name: 'send_executor',
    },
  ])
})

describe('SendExecutor - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(sx.opcodes.in.execute).toBe(crc32('CCIPSendExecutor_Execute'))
  })
})

describe('SendExecutor - Unit tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let deployable: SandboxContract<dep.ContractClient>
  let onrampSend: or.OnRampSend
  let onRampMock: SandboxContract<TreasuryContract>
  let feeQuoterMock: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }

    deployer = await blockchain.treasury('deployer')
    onRampMock = await blockchain.treasury('onrampMock')
    feeQuoterMock = await blockchain.treasury('feeQuoterMock')
    sender = await blockchain.treasury('sender')

    onrampSend = {
      msg: {
        queryID: 1,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        receiver: EVM_ADDRESS,
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: WRAPPED_NATIVE,
        extraArgs: beginCell().endCell(),
      },
      metadata: {
        sender: sender.address,
        value: toNano('0.6'),
      },
    }
  })

  beforeEach(async () => {
    deployable = await setup(blockchain, deployer)
  })

  const sendDeploy = async (
    selfMessage?: dep.Message,
  ): Promise<{
    sendExecutor: SandboxContract<sx.ContractClient>
    result: SendMessageResult & {
      result: void
    }
  }> => {
    return await sendDeployOnBlockchain(blockchain, deployer, deployable, selfMessage, onRampMock)
  }

  it('should match facility name and ID', async () => {
    const { sendExecutor } = await sendDeploy()
    const facilityIdVal = await sendExecutor.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(sx.FACILITY_ID))

    const { type } = await sendExecutor.getTypeAndVersion()
    expect(type).toBe(sx.FACILITY_NAME)

    expect(sx.FACILITY_ID).toEqual(facilityId(crc32(sx.FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const { sendExecutor } = await sendDeploy()

    const errorCodeVal = await sendExecutor.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(sx.ERROR_CODE))

    expect(sx.ERROR_CODE).toEqual(errorCode(crc32(sx.FACILITY_NAME), 0))
  })

  async function afterExecute(feeQuoterBouncer?: SandboxContract<bouncer.ContractClient>): Promise<{
    sendExecutor: SandboxContract<sx.ContractClient>
    result: SendMessageResult & {
      result: void
    }
  }> {
    const { sendExecutor, result } = await sendDeploy({
      value: toNano('0.3'),
      body: sx.builder.message.in.execute
        .encode({
          onrampSend,
          config: {
            feeQuoter: feeQuoterBouncer ? feeQuoterBouncer.address : feeQuoterMock.address,
          },
        })
        .asCell(),
    })

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: sendExecutor.address,
      success: true,
      op: sx.opcodes.in.execute,
      body(x) {
        if (!x) return false
        const msg = sx.builder.message.in.execute.load(x.beginParse())
        return msg.onrampSend.metadata.sender.equals(sender.address)
      },
    })
    return { sendExecutor, result }
  }

  it('should handle execute from self', async () => {
    const { sendExecutor, result } = await afterExecute()

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: feeQuoterMock.address,
      success: true,
      op: fq.opcodes.in.getValidatedFee,
    })
  })

  it('should throw execute from non-self', async () => {
    const { sendExecutor, result } = await sendDeploy()

    const execResult = await sendExecutor.sendExecute(sender.getSender(), toNano('0.3'), {
      onrampSend,
      config: {
        feeQuoter: feeQuoterMock.address,
      },
    })

    expect(execResult.transactions).toHaveTransaction({
      from: sender.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.error.Unauthorized,
    })
  })

  it('should throw on execute after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const execResult = await sendExecutor.sendExecute(deployer.getSender(), toNano('0.3'), {
      onrampSend,
      config: {
        feeQuoter: feeQuoterMock.address,
      },
    })

    expect(execResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: 9, // Tries to load different state
    })
  })

  it('should exit successfully on message validated from feeQuoter after execute if fee is lower than incoming value', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendMessageValidated(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      {
        fee: { feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') },
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.opcodes.in.executorFinishedSuccessfully,
      body(x) {
        if (!x) return false
        const executorFinishedSuccessfully =
          or.builder.messages.in.executorFinishedSuccessfully.load(x.beginParse())
        return (
          executorFinishedSuccessfully.executorID === 0n &&
          executorFinishedSuccessfully.fee.feeTokenAmount === toNano('0.1') &&
          executorFinishedSuccessfully.fee.feeValueJuels === toNano('0.1')
        )
      },
    })
  })

  it('should exit with error on message validated from feeQuoter after execute if fee is higher than incoming value', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendMessageValidated(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      {
        fee: {
          feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
          feeValueJuels: toNano('0.1'),
        },
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.opcodes.in.executorFinishedWithError,
      body(x) {
        if (!x) return false
        const executorFinishedWithError = or.builder.messages.in.executorFinishedWithError.load(
          x.beginParse(),
        )
        return executorFinishedWithError.error === BigInt(sx.error.InsufficientFunds)
      },
    })
  })

  it('should throw on message validated from non-feeQuoter after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendMessageValidated(deployer.getSender(), toNano('0.3'), {
      fee: {
        feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
        feeValueJuels: toNano('0.1'),
      },
      msg: onrampSend.msg,
      context: beginCell().asSlice(),
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.error.Unauthorized,
    })
  })

  it('should throw on message validated from feeQuoter before execute', async () => {
    const { sendExecutor } = await sendDeploy()

    const result = await sendExecutor.sendMessageValidated(deployer.getSender(), toNano('0.3'), {
      fee: {
        feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
        feeValueJuels: toNano('0.1'),
      },
      msg: onrampSend.msg,
      context: beginCell().asSlice(),
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: 63, // Tries to load different message
    })
  })

  it('should exit with error on message validation failed from feeQuoter after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendMessageValidationFailed(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      {
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.opcodes.in.executorFinishedWithError,
      body(x) {
        if (!x) return false
        const executorFinishedWithError = or.builder.messages.in.executorFinishedWithError.load(
          x.beginParse(),
        )
        return (
          executorFinishedWithError.executorID === 0n && executorFinishedWithError.error === 42n
        )
      },
    })
  })

  function errorExpecter(sendExecutor: SandboxContract<sx.ContractClient>) {
    return async function expectError(
      sendMessage: () => Promise<
        SendMessageResult & {
          result: void
        }
      >,
    ) {
      const result = await sendMessage()
      expect(result.transactions).toHaveTransaction({
        to: sendExecutor.address,
        success: false,
        exitCode: sx.error.StateNotExpected,
      })
    }
  }

  it('should throw on validation message after successful exit', async () => {
    const { sendExecutor } = await afterExecute()
    const result = await sendExecutor.sendMessageValidated(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      {
        fee: { feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') },
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.opcodes.in.executorFinishedSuccessfully,
    })

    const expectError = errorExpecter(sendExecutor)

    await expectError(() =>
      sendExecutor.sendMessageValidated(feeQuoterMock.getSender(), toNano('0.3'), {
        fee: { feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') },
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    await expectError(() =>
      sendExecutor.sendMessageValidationFailed(feeQuoterMock.getSender(), toNano('0.3'), {
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )
  })

  it('should throw on validation message after error exit', async () => {
    const { sendExecutor } = await afterExecute()
    const result = await sendExecutor.sendMessageValidated(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      {
        fee: {
          feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
          feeValueJuels: toNano('0.1'),
        },
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.opcodes.in.executorFinishedWithError,
    })

    const expectError = errorExpecter(sendExecutor)

    await expectError(() =>
      sendExecutor.sendMessageValidated(feeQuoterMock.getSender(), toNano('0.3'), {
        fee: { feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') },
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    await expectError(() =>
      sendExecutor.sendMessageValidationFailed(feeQuoterMock.getSender(), toNano('0.3'), {
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )
  })

  it('should handle bounced getValidatedFee', async () => {
    const feeQuoterBouncer = await blockchain.openContract(
      bouncer.ContractClient.createFromConfig(await compile('tests.mock.Bouncer')),
    )
    {
      const result = await feeQuoterBouncer.sendDeploy(deployer.getSender(), toNano('0.05'))

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: feeQuoterBouncer.address,
        deploy: true,
        success: false,
      })
    }

    const { sendExecutor, result } = await afterExecute(feeQuoterBouncer)

    expect(result.transactions).toHaveTransaction({
      from: feeQuoterBouncer.address,
      to: sendExecutor.address,
      success: true,
      op: 0xffffffff,
    })

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.opcodes.in.executorFinishedWithError,
      body(x) {
        if (!x) return false
        const executorFinishedWithError = or.builder.messages.in.executorFinishedWithError.load(
          x.beginParse(),
        )
        return (
          executorFinishedWithError.executorID === 0n &&
          executorFinishedWithError.error === BigInt(sx.error.FeeQuoterBounce)
        )
      },
    })
  })

  it('should throw on message validation failed from non-feeQuoter after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendMessageValidationFailed(
      deployer.getSender(),
      toNano('0.3'),
      {
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.error.Unauthorized,
    })
  })

  it('should throw on message validation failed from feeQuoter before execute', async () => {
    const { sendExecutor } = await sendDeploy()

    const result = await sendExecutor.sendMessageValidationFailed(
      deployer.getSender(),
      toNano('0.3'),
      {
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: 63, // Tries to load different message
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'send_executor_unit_tests', [
        {
          code: await compile('CCIPSendExecutor'),
          name: 'send_executor',
        },
      ])
    }
  })
})
