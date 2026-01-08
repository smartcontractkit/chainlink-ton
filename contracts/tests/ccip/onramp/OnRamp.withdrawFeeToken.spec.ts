import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as or from '../../../wrappers/ccip/OnRamp'
import { setup } from './OnRamp.Setup'
import { ZERO_ADDRESS } from '../../../src/utils'

describe('OnRamp - WithdrawFeeTokens', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let config: or.DynamicConfig

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

    const result = await onramp.sendWithdrawFeeTokens(deployer.getSender(), toNano('0.5'), {
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
    const result = await onramp.sendWithdrawFeeTokens(deployer.getSender(), toNano('0.5'), {
      feeTokens: [ZERO_ADDRESS],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.Errors.UnknownToken,
    })
  })

  it('should fail to withdraw fee tokens with low msg value', async () => {
    const result = await onramp.sendWithdrawFeeTokens(deployer.getSender(), toNano('0.01'), {
      feeTokens: [],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: false,
      exitCode: or.Errors.InsufficientValue,
    })
  })

  it('should fail to withdraw fee tokens with balance lower than reserve', async () => {
    // First, update reserve to be higher than balance
    {
      const balance = (await blockchain.getContract(onramp.address)).balance
      const result = await onramp.sendSetDynamicConfig(deployer.getSender(), {
        value: toNano('0.1'),
        body: {
          config: {
            ...config,
            reserve: balance + toNano('1'),
          },
        },
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
    const result = await onramp.sendWithdrawFeeTokens(
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

    const newBalance = (await blockchain.getContract(onramp.address)).balance
    expect(newBalance).toBe(prevBalance) // Balance should remain unchanged
  })

  it('should get reserve', async () => {
    const reserve = await onramp.getReserve()
    expect(reserve).toBeGreaterThan(BigInt(0))
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'onramp_withdraw_fee_tokens', [
        {
          code: await or.OnRamp.code(),
          name: 'onramp',
        },
      ])
    }
  })
})
