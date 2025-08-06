import '@ton/test-utils'

import { toNano, beginCell, Cell } from '@ton/core'
import { BaseTestSetup, TestCode } from './BaseTest'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as counter from '../../wrappers/examples/Counter'
import { errors } from '../../wrappers/lib/access/AccessControl'

describe('MCMS - RBACTimelockBlockFunctionTest', () => {
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

  function createCallWithSelector(selector: number): rbactl.Call {
    return {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: beginCell().storeUint(selector, 32).endCell(),
    }
  }

  function createCallWithData(data: Cell): rbactl.Call {
    return {
      target: baseTest.bind.counter.address,
      value: 0n,
      data: data,
    }
  }

  it('should fail if not admin tries to block function selector', async () => {
    // Try to block with proposer role (should fail)
    const body = rbactl.builder.message.blockFunctionSelector.encode({
      queryId: 1n,
      selector: counter.opcodes.in.IncreaseCount,
    })

    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.proposerOne.getSender(),
      toNano('0.05'),
      body,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.proposerOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: errors.UnouthorizedAccount,
    })
  })

  it('should block function selector', async () => {
    // Schedule operation should succeed first
    {
      const call = baseTest.createIncrementCall()
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
        success: true,
      })
    }

    // Block function selector
    {
      const blockBody = rbactl.builder.message.blockFunctionSelector.encode({
        queryId: 1n,
        selector: counter.opcodes.in.IncreaseCount,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('0.05'),
        blockBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.admin.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })
    }

    // Make sure blocked function cannot be scheduled
    {
      const call = baseTest.createIncrementCall()
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
        exitCode: 101, // ERROR_SELECTOR_IS_BLOCKED // TODO import from RBACTimelock
      })
    }
  })

  it('should block zero selector (c4issue41)', async () => {
    const zeroSelector = 0x00000000

    // Block zero function selector
    {
      const blockBody = rbactl.builder.message.blockFunctionSelector.encode({
        queryId: 1n,
        selector: zeroSelector,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('0.05'),
        blockBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.admin.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })
    }

    // Make sure that zero selector cannot be scheduled
    {
      const call = createCallWithSelector(zeroSelector)
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
        exitCode: 101, // ERROR_SELECTOR_IS_BLOCKED // TODO import from RBACTimelock
      })
    }

    // Make sure that zero selector plus another zero cannot be scheduled
    {
      const data = beginCell().storeUint(zeroSelector, 32).storeUint(0, 8).endCell()
      const call = createCallWithData(data)
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
        exitCode: 101, // ERROR_SELECTOR_IS_BLOCKED // TODO import from RBACTimelock
      })
    }

    // Make sure that empty call *can* be scheduled
    {
      const data = beginCell().endCell() // empty data
      const call = createCallWithData(data)
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
        success: true,
      })
    }

    // Make sure that three zero bytes can be scheduled
    {
      const data = beginCell().storeUint(0x000000, 24).endCell() // 3 zero bytes
      const call = createCallWithData(data)
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
        success: true,
      })
    }
  })

  it('should unblock function selector', async () => {
    // Block Function
    {
      const blockBody = rbactl.builder.message.blockFunctionSelector.encode({
        queryId: 1n,
        selector: counter.opcodes.in.IncreaseCount,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('0.05'),
        blockBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.admin.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })
    }

    // Try schedule blocked function and expect it to revert
    {
      const call = baseTest.createIncrementCall()
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
        exitCode: 101, // ERROR_SELECTOR_IS_BLOCKED // TODO import from RBACTimelock
      })
    }

    // Unblock Function
    {
      const unblockBody = rbactl.builder.message.unblockFunctionSelector.encode({
        queryId: 1n,
        selector: counter.opcodes.in.IncreaseCount,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('0.05'),
        unblockBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.admin.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })
    }

    // Make sure unblocked function can be scheduled
    {
      const call = baseTest.createIncrementCall()
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
        success: true,
      })

      // Verify operation exists
      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }

      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      expect(await baseTest.bind.timelock.isOperation(operationID)).toBe(true)
    }
  })
})
