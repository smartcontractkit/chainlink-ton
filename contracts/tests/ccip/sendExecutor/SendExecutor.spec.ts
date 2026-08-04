import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import { ChainSelectors } from '../../utils/Selectors'
import { crc32 } from 'zlib'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import { errorCode, facilityId } from '../../../wrappers/utils'
import EVM_ADDRESS from '../../utils/evmAddress'
import { WRAPPED_NATIVE } from '../../../src/utils'

import { setup as ccipSendExecutor, sendDeployOnBlockchain, setup } from './SendExecutor.Setup'
import * as TypeAndVersionSpec from '../../lib/versioning/TypeAndVersionSpec'
import * as sx from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import {
  FACILITY_NAME,
  CONTRACT_VERSION,
  FACILITY_ID,
  ERROR_CODE,
} from '../../../wrappers/ccip/CCIPSendExecutor'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as bouncer from '../../../wrappers/test/mock/Bouncer'

describe('SendExecutor - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: FACILITY_NAME,
    version: CONTRACT_VERSION,
    deployContract: async (
      blockchain: Blockchain,
      deployer: SandboxContract<TreasuryContract>,
    ): Promise<SandboxContract<sx.CCIPSendExecutor>> => {
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
    expect(sx.CCIPSendExecutor_Execute.PREFIX).toBe(crc32('CCIPSendExecutor_Execute'))
  })
})

describe('SendExecutor - Unit tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let deployable: SandboxContract<dep.ContractClient>
  let onrampSend: or.OnRamp_Send
  let onRampMock: SandboxContract<TreasuryContract>
  let feeQuoterMock: SandboxContract<TreasuryContract>
  let tokenRegistryMock: SandboxContract<TreasuryContract>
  // onrampSend that carries a token transfer (non-empty tokenAmounts).
  let tokenOnrampSend: or.OnRamp_Send

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
    tokenRegistryMock = await blockchain.treasury('tokenRegistryMock')
    sender = await blockchain.treasury('sender')

    onrampSend = or.OnRamp_Send.create({
      msg: or.Router_CCIPSend.create({
        queryID: 1n,
        destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        receiver: EVM_ADDRESS,
        data: Cell.EMPTY,
        tokenAmounts: [],
        feeToken: WRAPPED_NATIVE,
        extraArgs: or.GenericExtraArgsV2.create({
          gasLimit: null,
          allowOutOfOrderExecution: true,
        }),
      }),
      metadata: or.Metadata.create({
        sender: sender.address,
        value: toNano('0.6'),
      }),
      tokenRegistry: null,
    })

    tokenOnrampSend = or.OnRamp_Send.create({
      msg: {
        ...onrampSend.msg,
        tokenAmounts: [or.TokenAmount.create({ amount: toNano('1'), token: WRAPPED_NATIVE })],
      },
      metadata: or.Metadata.create({
        sender: sender.address,
        // Must comfortably exceed fee + Router_Costs.CCIPSend() so the executor proceeds to the
        // token-transfer path instead of exiting with InsufficientFunds.
        value: toNano('5'),
      }),
      tokenRegistry: tokenRegistryMock.address,
    })
  })

  beforeEach(async () => {
    deployable = await setup(blockchain, deployer)
  })

  const sendDeploy = async (
    selfMessage?: dep.Message,
  ): Promise<{
    sendExecutor: SandboxContract<sx.CCIPSendExecutor>
    result: SendMessageResult & {
      result: void
    }
  }> => {
    return await sendDeployOnBlockchain(blockchain, deployer, deployable, selfMessage, onRampMock)
  }

  it('should match facility name and ID', async () => {
    const { sendExecutor } = await sendDeploy()
    const facilityIdVal = await sendExecutor.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(FACILITY_ID))

    const [typeSlice] = await sendExecutor.getTypeAndVersion()
    expect(typeSlice.loadStringTail()).toBe(FACILITY_NAME)

    expect(FACILITY_ID).toEqual(facilityId(crc32(FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const { sendExecutor } = await sendDeploy()

    const errorCodeVal = await sendExecutor.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ERROR_CODE))

    expect(ERROR_CODE).toEqual(errorCode(crc32(FACILITY_NAME)))
  })

  // Deploys and runs the execute self-message. The payload can optionally carry a tokenRegistry,
  // and the onrampSend can optionally carry a token transfer.
  async function afterExecute(opts?: {
    feeQuoterBouncer?: SandboxContract<bouncer.ContractClient>
    send?: or.OnRamp_Send
  }): Promise<{
    sendExecutor: SandboxContract<sx.CCIPSendExecutor>
    result: SendMessageResult & {
      result: void
    }
  }> {
    const send = opts?.send ?? { ...onrampSend, tokenRegistry: null }
    const { sendExecutor, result } = await sendDeploy({
      value: toNano('1'),
      body: sx.CCIPSendExecutor_Execute.toCell(
        sx.CCIPSendExecutor_Execute.create({
          onrampSend: send,
          config: sx.CCIPSendExecutor_Config.create({
            feeQuoter: opts?.feeQuoterBouncer
              ? opts.feeQuoterBouncer.address
              : feeQuoterMock.address,
          }),
        }),
      ),
    })

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: sendExecutor.address,
      success: true,
      op: sx.CCIPSendExecutor_Execute.PREFIX,
      body(x) {
        if (!x) return false
        const msg = sx.CCIPSendExecutor_Execute.fromSlice(x.beginParse())
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
      op: fq.FeeQuoter_GetValidatedFee.PREFIX,
    })
  })

  it('should throw execute from non-self', async () => {
    const { sendExecutor, result } = await sendDeploy()

    const execResult = await sendExecutor.sendCCIPSendExecutorExecute(
      sender.getSender(),
      toNano('1'),
      {
        onrampSend,
        config: sx.CCIPSendExecutor_Config.create({
          feeQuoter: feeQuoterMock.address,
        }),
      },
    )

    expect(execResult.transactions).toHaveTransaction({
      from: sender.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.Unauthorized'],
    })
  })

  it('should throw on execute after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const execResult = await sendExecutor.sendCCIPSendExecutorExecute(
      deployer.getSender(),
      toNano('1'),
      {
        onrampSend,
        config: sx.CCIPSendExecutor_Config.create({
          feeQuoter: feeQuoterMock.address,
        }),
      },
    )

    expect(execResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: 9, // Tries to load different state
    })
  })

  it('should throw execute from non-self with tokenRegistry payload', async () => {
    const { sendExecutor, result } = await sendDeploy()

    const execResult = await sendExecutor.sendCCIPSendExecutorExecute(
      sender.getSender(),
      toNano('1'),
      {
        onrampSend: { ...onrampSend, tokenRegistry: null },
        config: sx.CCIPSendExecutor_Config.create({
          feeQuoter: feeQuoterMock.address,
        }),
      },
    )

    expect(execResult.transactions).toHaveTransaction({
      from: sender.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.Unauthorized'],
    })
  })

  it('should throw on execute after execute with tokenRegistry payload', async () => {
    const { sendExecutor } = await afterExecute()

    const execResult = await sendExecutor.sendCCIPSendExecutorExecute(
      deployer.getSender(),
      toNano('1'),
      {
        onrampSend: { ...onrampSend, tokenRegistry: null },
        config: sx.CCIPSendExecutor_Config.create({
          feeQuoter: feeQuoterMock.address,
        }),
      },
    )
    expect(execResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: 9, // Tries to load different state
    })
  })

  it('should handle execute from self with a tokenRegistry in the payload', async () => {
    const { sendExecutor, result } = await afterExecute({
      send: {
        ...onrampSend,
        tokenRegistry: tokenRegistryMock.address,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: feeQuoterMock.address,
      success: true,
      op: fq.FeeQuoter_GetValidatedFee.PREFIX,
    })
  })

  it('should handle execute from self without a tokenRegistry in the payload', async () => {
    const { sendExecutor, result } = await afterExecute()

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: feeQuoterMock.address,
      success: true,
      op: fq.FeeQuoter_GetValidatedFee.PREFIX,
    })
  })

  it('should query the tokenRegistry from the payload on validated fee for a token transfer', async () => {
    // The message carries a token transfer and payload tokenRegistry:
    // on a successful fee validation the executor must query that tokenRegistry.
    const { sendExecutor } = await afterExecute({
      send: {
        ...tokenOnrampSend,
        tokenRegistry: tokenRegistryMock.address,
      },
    })

    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({ feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') }),
        msg: tokenOnrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    // The query must be addressed to the tokenRegistry from the payload.
    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: tokenRegistryMock.address,
      success: true,
    })
    // And it must NOT have already finished the send back to the OnRamp.
    expect(result.transactions).not.toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
    })
  })

  it('should exit successfully on validated fee without a token transfer or tokenRegistry', async () => {
    // A payload without a tokenRegistry and a message without token transfers behaves like the
    // plain messaging flow: it finishes successfully without touching any registry.
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({ feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
      body(x) {
        if (!x) return false
        const finished = or.OnRamp_ExecutorFinishedSuccessfully.fromSlice(x.beginParse())
        return finished.fee.feeTokenAmount === toNano('0.1')
      },
    })
  })

  it('should exit successfully on message validated from feeQuoter after execute if fee is lower than incoming value', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({ feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
      body(x) {
        if (!x) return false
        const executorFinishedSuccessfully = or.OnRamp_ExecutorFinishedSuccessfully.fromSlice(
          x.beginParse(),
        )
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

    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({
          feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
          feeValueJuels: toNano('0.1'),
        }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedWithError.PREFIX,
      body(x) {
        if (!x) return false
        const executorFinishedWithError = or.OnRamp_ExecutorFinishedWithError.fromSlice(
          x.beginParse(),
        )
        return (
          executorFinishedWithError.error ===
          BigInt(sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.InsufficientFunds'])
        )
      },
    })
  })

  it('should throw on message validated from non-feeQuoter after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      deployer.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({
          feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
          feeValueJuels: toNano('0.1'),
        }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.Unauthorized'],
    })
  })

  it('should throw on message validated from feeQuoter before execute', async () => {
    const { sendExecutor } = await sendDeploy()

    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      deployer.getSender(), // TODO Should be feeQuoterMock?
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({
          feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
          feeValueJuels: toNano('0.1'),
        }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: 63, // Tries to load different message
    })
  })

  it('should exit with error on message validation failed from feeQuoter after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendFeeQuoterMessageValidationFailedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidationFailed.create({
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedWithError.PREFIX,
      body(x) {
        if (!x) return false
        const executorFinishedWithError = or.OnRamp_ExecutorFinishedWithError.fromSlice(
          x.beginParse(),
        )
        return (
          executorFinishedWithError.executorID === 0n && executorFinishedWithError.error === 42n
        )
      },
    })
  })

  function errorExpecter(sendExecutor: SandboxContract<sx.CCIPSendExecutor>) {
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
        exitCode: sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.StateNotExpected'],
      })
    }
  }

  it('should throw on validation message after successful exit', async () => {
    const { sendExecutor } = await afterExecute()
    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({ feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedSuccessfully.PREFIX,
    })

    const expectError = errorExpecter(sendExecutor)

    await expectError(() =>
      sendExecutor.sendFeeQuoterMessageValidatedAny(
        feeQuoterMock.getSender(),
        toNano('0.3'),
        sx.FeeQuoter_MessageValidated.create({
          fee: sx.Fee.create({ feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') }),
          msg: onrampSend.msg,
          context: beginCell().asSlice(),
        }),
      ),
    )

    await expectError(() =>
      sendExecutor.sendFeeQuoterMessageValidationFailedAny(
        feeQuoterMock.getSender(),
        toNano('0.3'),
        sx.FeeQuoter_MessageValidationFailed.create({
          error: 42n,
          msg: onrampSend.msg,
          context: beginCell().asSlice(),
        }),
      ),
    )
  })

  it('should throw on validation message after error exit', async () => {
    const { sendExecutor } = await afterExecute()
    const result = await sendExecutor.sendFeeQuoterMessageValidatedAny(
      feeQuoterMock.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidated.create({
        fee: sx.Fee.create({
          feeTokenAmount: onrampSend.metadata.value + toNano('0.1'),
          feeValueJuels: toNano('0.1'),
        }),
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )
    expect(result.transactions).toHaveTransaction({
      from: sendExecutor.address,
      to: onRampMock.address,
      success: true,
      op: or.OnRamp_ExecutorFinishedWithError.PREFIX,
    })

    const expectError = errorExpecter(sendExecutor)

    await expectError(() =>
      sendExecutor.sendFeeQuoterMessageValidatedAny(
        feeQuoterMock.getSender(),
        toNano('0.3'),
        sx.FeeQuoter_MessageValidated.create({
          fee: sx.Fee.create({ feeTokenAmount: toNano('0.1'), feeValueJuels: toNano('0.1') }),
          msg: onrampSend.msg,
          context: beginCell().asSlice(),
        }),
      ),
    )

    await expectError(() =>
      sendExecutor.sendFeeQuoterMessageValidationFailedAny(
        feeQuoterMock.getSender(),
        toNano('0.3'),
        sx.FeeQuoter_MessageValidationFailed.create({
          error: 42n,
          msg: onrampSend.msg,
          context: beginCell().asSlice(),
        }),
      ),
    )
  })

  it('should handle bounced getValidatedFee', async () => {
    const feeQuoterBouncer = await blockchain.openContract(
      bouncer.ContractClient.createFromConfig(await contractCode.ccip.local('tests.mock.Bouncer')),
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

    const { sendExecutor, result } = await afterExecute({ feeQuoterBouncer })

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
      op: or.OnRamp_ExecutorFinishedWithError.PREFIX,
      body(x) {
        if (!x) return false
        const executorFinishedWithError = or.OnRamp_ExecutorFinishedWithError.fromSlice(
          x.beginParse(),
        )
        return (
          executorFinishedWithError.executorID === 0n &&
          executorFinishedWithError.error ===
            BigInt(sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.FeeQuoterBounce'])
        )
      },
    })
  })

  it('should throw on message validation failed from non-feeQuoter after execute', async () => {
    const { sendExecutor } = await afterExecute()

    const result = await sendExecutor.sendFeeQuoterMessageValidationFailedAny(
      deployer.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidationFailed.create({
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: sendExecutor.address,
      success: false,
      exitCode: sx.CCIPSendExecutor.Errors['CCIPSendExecutor_Error.Unauthorized'],
    })
  })

  it('should throw on message validation failed from feeQuoter before execute', async () => {
    const { sendExecutor } = await sendDeploy()

    const result = await sendExecutor.sendFeeQuoterMessageValidationFailedAny(
      deployer.getSender(),
      toNano('0.3'),
      sx.FeeQuoter_MessageValidationFailed.create({
        error: 42n,
        msg: onrampSend.msg,
        context: beginCell().asSlice(),
      }),
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
          code: await contractCode.ccip.local('CCIPSendExecutor'),
          name: 'send_executor',
        },
      ])
    }
  })
})
