import '@ton/test-utils'

import { Address, toNano } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as ac from '../../wrappers/lib/access/AccessControl'
import * as counter from '../../wrappers/examples/Counter'

import { BaseTestSetup, TestCode } from './BaseTest'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

describe('MCMS - RBACTimelockScheduleBatchTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-schedule-batch')
  })

  function CreateCallBatch() {
    // TODO the original test creates a vec of 2 calls
    // let callVec: rbactl.Call[] = []
    // callVec.push({
    //   target: baseTest.bind.counter.address,
    //   value: 0n,
    //   data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    // })
    // callVec.push({
    //   target: baseTest.bind.counter.address,
    //   value: 0n,
    //   data: counter.builder.message.increaseCount.encode({ queryId: 2n }),
    // })
    // return encodeBatch(callVec)

    return BaseTestSetup.singletonCalls({
      target: baseTest.bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    })
  }

  it('should fail if non-proposer tries to schedule batch', async () => {
    const calls = CreateCallBatch()

    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    // Try to schedule with executor role (should fail)
    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.executorOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.executorOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: ac.Errors.UnauthorizedAccount,
    })
  })

  it('should fail if batch contains blocked function', async () => {
    // Block the increment function selector
    const blockBody = rbactl.builder.message.blockFunctionSelector.encode({
      queryId: 1n,
      selector: counter.opcodes.in.IncreaseCount,
    })

    await baseTest.bind.timelock.sendInternal(
      baseTest.acc.admin.getSender(),
      toNano('0.05'),
      blockBody,
    )

    // Try to schedule a batch with the blocked function
    const calls = CreateCallBatch()

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
      success: false,
      exitCode: rbactl.Errors.SelectorIsBlocked,
    })
  })

  it('should allow proposer to schedule batch operation', async () => {
    await scheduleBatchedOperation(baseTest.acc.proposerOne)
  })

  it('should allow admin to schedule batch operation', async () => {
    await scheduleBatchedOperation(baseTest.acc.admin)
  })

  async function scheduleBatchedOperation(scheduler: SandboxContract<TreasuryContract>) {
    const calls = CreateCallBatch()

    // Get operation ID before scheduling
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
    }
    const batchedOperationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

    // Verify operation doesn't exist yet
    expect(await baseTest.bind.timelock.isOperation(batchedOperationID)).toBe(false)

    // Schedule the batch operation
    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    const result = await baseTest.bind.timelock.sendInternal(
      scheduler.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: scheduler.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    // Verify operation now exists
    expect(await baseTest.bind.timelock.isOperation(batchedOperationID)).toBe(true)

    // Verify operation is in pending state (scheduled but not yet executable)
    expect(await baseTest.bind.timelock.isOperationPending(batchedOperationID)).toBe(true)
    expect(await baseTest.bind.timelock.isOperationReady(batchedOperationID)).toBe(false)
    expect(await baseTest.bind.timelock.isOperationDone(batchedOperationID)).toBe(false)
  }
})

describe('MCMS - RBACTimelockScheduleTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-schedule')
  })

  it('should fail if non-proposer tries to schedule', async () => {
    const call = {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    // Try to schedule with a non-proposer account (should fail)
    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.executorOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.executorOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: ac.Errors.UnauthorizedAccount,
    })
  })

  it('should fail if scheduling a blocked function', async () => {
    // Block the increment function selector
    const blockBody = rbactl.builder.message.blockFunctionSelector.encode({
      queryId: 1n,
      selector: counter.opcodes.in.IncreaseCount,
    })

    await baseTest.bind.timelock.sendInternal(
      baseTest.acc.admin.getSender(),
      toNano('0.05'),
      blockBody,
    )

    // Try to schedule the blocked function
    const call = {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

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
      success: false,
      exitCode: rbactl.Errors.SelectorIsBlocked,
    })
  })

  it('should fail if operation already scheduled', async () => {
    const call = {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    // Schedule operation first time
    const firstResult = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.proposerOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(firstResult.transactions).toHaveTransaction({
      from: baseTest.acc.proposerOne.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    // Try to schedule the same operation again (should fail)
    const secondResult = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.proposerOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(secondResult.transactions).toHaveTransaction({
      from: baseTest.acc.proposerOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: rbactl.Errors.OperationAlreadyScheduled,
    })
  })

  it('should fail if delay is less than minimum delay', async () => {
    const call = {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY - 1, // Less than minimum delay
    })

    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.proposerOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.proposerOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: rbactl.Errors.InsufficientDelay,
    })
  })

  it('should allow proposer to schedule operation', async () => {
    await scheduleOperation(baseTest.acc.proposerOne)
  })

  it('should allow admin to schedule operation', async () => {
    await scheduleOperation(baseTest.acc.admin)
  })

  async function scheduleOperation(scheduler: SandboxContract<TreasuryContract>) {
    const call = {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
    const calls = BaseTestSetup.singletonCalls(call)

    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    const result = await baseTest.bind.timelock.sendInternal(
      scheduler.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: scheduler.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    // Get operation ID and verify it exists
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
    }
    const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

    expect(await baseTest.bind.timelock.isOperation(operationID)).toBe(true)
  }
})
