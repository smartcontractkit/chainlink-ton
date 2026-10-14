import { Address, beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as ex from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as dep from '../../../wrappers/libraries/Deployable'
import { setup } from './OnRamp.Setup'
import { generateRandomContractId, WRAPPED_NATIVE } from '../../../src/utils'
import { contractCode } from '../../../wrappers/codeLoader'
import { ChainSelectors } from '../../utils/Selectors'
import EVM_ADDRESS from '../../utils/evmAddress'
import { onrampSendCost } from '../../../wrappers/ccip/OnRamp'
import { findTransactionRequired } from '@ton/test-utils'

describe('OnRamp - WithdrawFeeTokens', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let config: or.OnRamp_DynamicConfig

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
    ;({ deployer, onramp, config } = await setup(blockchain))
  })

  it('should succeed to withdraw empty fee tokens', async () => {
    const reserve = await onramp.getReserve()
    expect(reserve).toBeGreaterThan(BigInt(0))

    const balanceBefore = (await blockchain.getContract(onramp.address)).balance
    expect(balanceBefore).toBeGreaterThan(reserve)

    const result = await onramp.sendOnRampWithdrawFeeTokens(deployer.getSender(), toNano('0.5'), {
      feeTokens: [],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: config.feeAggregator,
      value(x) {
        if (!x) return false
        return x > balanceBefore - reserve
      },
    })

    const balanceAfter = (await blockchain.getContract(onramp.address)).balance
    expect(balanceAfter).toBe(reserve)
  })

  it('should fail to withdraw non empty fee tokens', async () => {
    const result = await onramp.sendOnRampWithdrawFeeTokens(deployer.getSender(), toNano('0.5'), {
      feeTokens: [WRAPPED_NATIVE],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.UnknownToken'],
    })
  })

  it('should fail to withdraw fee tokens with low msg value', async () => {
    const result = await onramp.sendOnRampWithdrawFeeTokens(deployer.getSender(), toNano('0.01'), {
      feeTokens: [],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.OnRamp.Errors['OnRamp_Error.InsufficientValue'],
    })
  })

  it('should fail to withdraw fee tokens with balance lower than reserve', async () => {
    // First, update reserve to be higher than balance
    {
      const balance = (await blockchain.getContract(onramp.address)).balance
      const result = await onramp.sendOnRampSetDynamicConfig(deployer.getSender(), toNano('0.1'), {
        config: or.OnRamp_DynamicConfig.create({
          ...config,
          reserve: balance + toNano('1'),
        }),
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: true,
      })
    }
    const reserve = await onramp.getReserve()
    const withdrawalFeeTokensMsgValue = toNano('0.5')
    const prevBalance = (await blockchain.getContract(onramp.address)).balance
    expect(prevBalance).toBeLessThan(reserve + withdrawalFeeTokensMsgValue) // Ensure balance is lower than reserve + msg value

    // Now, try to withdraw again, which should fail
    const result = await onramp.sendOnRampWithdrawFeeTokens(
      deployer.getSender(),
      withdrawalFeeTokensMsgValue,
      {
        feeTokens: [],
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: deployer.address,
      inMessageBounced: true,
    })

    const tx = result.transactions.find(
      (t) =>
        t.inMessage?.info.type === 'internal' &&
        t.inMessage.info.dest.equals(onramp.address) &&
        t.description.type === 'generic',
    )
    if (!tx) {
      throw new Error('Expected transaction not found')
    }
    if (tx.description.type !== 'generic') {
      throw new Error('Expected generic transaction description')
    }

    const newBalance = (await blockchain.getContract(onramp.address)).balance
    expect(newBalance).toBe(prevBalance - (tx.description.storagePhase?.storageFeesCollected ?? 0n)) // Balance should remain unchanged except from rent fees
  })

  it('should get reserve', async () => {
    const reserve = await onramp.getReserve()
    expect(reserve).toBeGreaterThan(BigInt(0))
  })

  it('should not withdraw fees reserved for in-flight executors', async () => {
    // Drive a real send so the OnRamp deploys an executor, then have the
    // executor reserve its fee: the counter must now exclude that fee from
    // withdrawals.
    const sender = await blockchain.treasury('sender')
    const mockRouter = await blockchain.treasury('mockRouter')
    const mockFeeQuoter = await blockchain.treasury('mockFeeQuoter')
    const executorID = BigInt(generateRandomContractId())
    const fee = toNano('0.3')

    // Configure the lane and point the fee quoter at the mock.
    {
      const setConfig = await onramp.sendOnRampSetDynamicConfig(
        deployer.getSender(),
        toNano('0.1'),
        {
          config: or.OnRamp_DynamicConfig.create({
            ...config,
            feeQuoter: mockFeeQuoter.address,
          }),
        },
      )
      expect(setConfig.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: true,
      })
      const updateDest = await onramp.sendOnRampUpdateDestChainConfigs(
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
      expect(updateDest.transactions).toHaveTransaction({
        from: deployer.address,
        to: onramp.address,
        success: true,
      })
    }

    const ccipSend = or.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      // A token transfer keeps the executor mid-flight after the reservation:
      // it pauses awaiting the TokenAdminRegistry's reply instead of finishing
      // immediately (which would release the reservation in the same chain).
      tokenAmounts: [or.TokenAmount.create({ amount: toNano('1'), token: WRAPPED_NATIVE })],
      feeToken: WRAPPED_NATIVE,
      extraArgs: or.GenericExtraArgsV2.create({
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      }),
    })
    const sendResult = await onramp.sendOnRampSend(mockRouter.getSender(), onrampSendCost, {
      msg: ccipSend,
      metadata: or.Metadata.create({ sender: sender.address, value: toNano('42') }),
    })
    expect(sendResult.transactions).toHaveTransaction({
      from: onramp.address,
      deploy: true,
      success: true,
      op: dep.opcodes.in.initializeAndSend,
    })

    // Grab the deployed executor's address from the deploy transaction.
    const deployTX = findTransactionRequired(sendResult.transactions, { from: onramp.address })
    if (!deployTX?.inMessage || !(deployTX.inMessage.info.dest instanceof Address)) {
      throw new Error('Deploy transaction not found')
    }
    const executorAddress = deployTX.inMessage.info.dest

    // The executor reserves its validated fee.
    const executor = blockchain.openContract(ex.CCIPSendExecutor.fromAddress(executorAddress))
    const reserveResult = await executor.sendFeeQuoterMessageValidated(
      mockFeeQuoter.getSender(),
      toNano('0.3'),
      ex.FeeQuoter_MessageValidated.create({
        fee: ex.Fee.create({ feeTokenAmount: fee, feeValueJuels: fee }),
        msg: ccipSend,
        destGasOverheads: [90_000n],
      }),
    )
    expect(reserveResult.transactions).toHaveTransaction({
      from: executorAddress,
      to: onramp.address,
      success: true,
      op: or.OnRamp_ExecutorReserveFee.PREFIX,
    })
    expect(await onramp.getPendingFeeReservations()).toBe(fee)

    // The withdrawal must leave the static reserve AND the pending reservation
    // on the contract.
    const result = await onramp.sendOnRampWithdrawFeeTokens(deployer.getSender(), toNano('0.5'), {
      feeTokens: [],
    })

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: config.feeAggregator,
      success: true,
    })

    const balanceAfter = (await blockchain.getContract(onramp.address)).balance
    expect(balanceAfter).toBe((await onramp.getReserve()) + fee)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_withdraw_fee_tokens', [
        {
          code: await contractCode.ccip.local('OnRamp'),
          name: 'onramp',
        },
      ])
    }
  })
})
