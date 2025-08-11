import '@ton/test-utils'

import { toNano, beginCell, Cell, Address } from '@ton/core'
import { BaseTestSetup, TestCode } from './BaseTest'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as counter from '../../wrappers/examples/Counter'
import * as ac from '../../wrappers/lib/access/AccessControl'

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
      exitCode: ac.Errors.UnauthorizedAccount,
    })
  })

  it('should block function selector', async () => {
    // Schedule operation should succeed first
    {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
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

      // Check for Timelock_FunctionSelectorBlocked event
      // const externalsFromTimelock = result.externals.filter((e) => {
      //   return e.info.src.equals(baseTest.bind.timelock.address)
      // })

      // expect(externalsFromTimelock).toHaveLength(1)

      // const blockedExternal = externalsFromTimelock[0]
      // expect(blockedExternal.info.dest?.value.toString(16)).toEqual(
      //   rbactl.opcodes.out.FunctionSelectorBlocked.toString(16),
      // )

      // const opcode = blockedExternal.body.beginParse().preloadUint(32)
      // const blockedEvent = rbactl.builder.event.functionSelectorBlocked.decode(blockedExternal.body)

      // expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.FunctionSelectorBlocked.toString(16))
      // expect(blockedEvent.queryId).toEqual(1)
      // expect(blockedEvent.selector).toEqual(counter.opcodes.in.IncreaseCount)
    }

    // Make sure blocked function cannot be scheduled
    {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.increaseCount.encode({ queryId: 2n }),
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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: beginCell().storeUint(zeroSelector, 32).endCell(), // zero function selector
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
    }

    // Make sure that zero selector plus another zero cannot be scheduled
    {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: beginCell().storeUint(zeroSelector, 32).storeUint(0, 8).endCell(),
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
    }

    // Make sure that empty call *can* be scheduled
    {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: beginCell().endCell(), // empty data
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
        success: true,
      })
    }

    // Make sure that three zero bytes can be scheduled
    {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: beginCell().storeUint(0x000000, 24).endCell(), // 3 zero bytes
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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
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

      // Check for FunctionSelectorUnblocked confirmation
      const functionSelectorUnblockedTx = result.transactions.filter((t) => {
        const src = t.inMessage?.info.src! as Address
        return src && src.equals(baseTest.bind.timelock.address)
      })

      expect(functionSelectorUnblockedTx).toHaveLength(1)
      expect(functionSelectorUnblockedTx[0].inMessage).toBeDefined()

      const functionSelectorUnblockedMsg = functionSelectorUnblockedTx[0].inMessage!
      const opcode = functionSelectorUnblockedMsg.body.beginParse().preloadUint(32)
      const unblockedEvent = rbactl.builder.event.functionSelectorUnblocked.decode(
        functionSelectorUnblockedMsg.body,
      )

      expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.FunctionSelectorUnblocked.toString(16))
      expect(unblockedEvent.queryId).toEqual(1)
      expect(unblockedEvent.selector).toEqual(counter.opcodes.in.IncreaseCount)
    }

    // Make sure unblocked function can be scheduled
    {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
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
