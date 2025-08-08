import '@ton/test-utils'

import { Address, toNano } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'

import { BaseTestSetup, TestCode } from './BaseTest'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import * as counter from '../../wrappers/examples/Counter'

describe('MCMS - RBACTimelockCancelTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-cancel')
  })

  it('should fail if non-canceller tries to cancel', async () => {
    // Try to cancel with executor role (should fail)
    const body = rbactl.builder.message.cancel.encode({
      queryId: 1n,
      id: BaseTestSetup.EMPTY_SALT,
    })

    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.executorOne.getSender(),
      toNano('0.05'),
      body,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.executorOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
    })
  })

  it('should not be able to cancel finished operation', async () => {
    const call = {
      target: baseTest.bind.counter.address,
      value: toNano('0.05'),
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

    // Schedule operation
    {
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
        delay: BaseTestSetup.MIN_DELAY,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.proposerOne.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })
    }

    // Wait for delay
    baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY + 1n))

    // Execute operation
    {
      const executeBody = rbactl.builder.message.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.executorOne.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })

      // Verify counter was incremented
      expect(await baseTest.bind.counter.getValue()).toEqual(1)
    }

    // Get operation ID
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
    }
    const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

    // Try to cancel finished operation (should fail)
    {
      const cancelBody = rbactl.builder.message.cancel.encode({
        queryId: 1n,
        id: operationID,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.cancellerOne.getSender(),
        toNano('0.05'),
        cancelBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.cancellerOne.address,
        to: baseTest.bind.timelock.address,
        success: false,
      })
    }
  })

  it('should allow canceller to cancel operation', async () => {
    await cancelOperation(baseTest.acc.cancellerOne)
  })

  it('should allow admin to cancel operation', async () => {
    await cancelOperation(baseTest.acc.admin)
  })

  async function cancelOperation(canceller: SandboxContract<TreasuryContract>) {
    const call = {
      target: baseTest.bind.counter.address,
      value: toNano('0.05'),
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

    // Schedule operation
    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    const scheduleResult = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.proposerOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    // Verify schedule was successful
    expect(scheduleResult.transactions).toHaveTransaction({
      from: baseTest.acc.proposerOne.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    // Get operation ID
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
    }
    const operationId = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

    // Verify operation exists
    expect(await baseTest.bind.timelock.isOperation(operationId)).toBe(true)

    // Cancel operation
    const cancelBody = rbactl.builder.message.cancel.encode({
      queryId: 1n,
      id: operationId,
    })

    const cancelResult = await baseTest.bind.timelock.sendInternal(
      canceller.getSender(),
      toNano('0.05'),
      cancelBody,
    )

    expect(cancelResult.transactions).toHaveTransaction({
      from: canceller.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    // Verify operation no longer exists
    expect(await baseTest.bind.timelock.isOperation(operationId)).toBe(false)
  }
})
