import '@ton/test-utils'

import { Address, toNano, beginCell } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as counter from '../../wrappers/examples/Counter'
import * as ac from '../../wrappers/lib/access/AccessControl'

import { BaseTestSetup, TestCode } from './BaseTest'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

describe('MCMS - RBACTimelockExecuteTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode
  let counterTwo: SandboxContract<counter.ContractClient>

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-execute')

    // Create second counter for batch operations
    const counterTwoData = {
      id: 2,
      value: 0,
      ownable: {
        owner: baseTest.bind.timelock.address,
        pendingOwner: null,
      },
    }
    counterTwo = baseTest.blockchain.openContract(
      counter.ContractClient.newFrom(counterTwoData, code.counter),
    )
  })

  describe('Bypasser Execute Batch Tests', () => {
    it('should fail if non-bypasser tries to execute batch', async () => {
      const calls = BaseTestSetup.singletonCalls({
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      })

      const body = rbactl.builder.message.in.bypasserExecuteBatch.encode({
        queryId: 1n,
        calls,
      })

      // Try with proposer role (should fail)
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

    // TODO: Timelock doesn't handle reverts yet, and we do not know if it will
    it.skip('should fail if one target reverts (invalid call)', async () => {
      // Create a call with invalid data that will cause failure
      const invalidCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: beginCell().storeUint(0x99999999, 32).endCell(), // Invalid opcode
      }
      const calls = BaseTestSetup.singletonCalls(invalidCall)

      const body = rbactl.builder.message.in.bypasserExecuteBatch.encode({
        queryId: 1n,
        calls,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.admin.address,
        to: baseTest.bind.timelock.address,
        success: false,
      })
    })

    it('should allow bypasser to execute batch operations', async () => {
      const incrementCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      }
      const setCountCall: rbactl.Call = {
        target: counterTwo.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.setCount.encode({
          queryId: 1n,
          newCount: 10,
        }),
      }

      const calls = BaseTestSetup.singletonCalls(incrementCall) // TODO This should include setCountCall as well

      const executeMsg = rbactl.builder.message.in.bypasserExecuteBatch.encode({
        queryId: 1n,
        calls,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.bypasserOne.getSender(),
        toNano('1'),
        executeMsg,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.bypasserOne.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })

      // Check for Timelock_BypasserCallExecuted events
      const externalsFromTimelock = result.externals.filter((e) => {
        return e.info.src.equals(baseTest.bind.timelock.address)
      })

      expect(externalsFromTimelock).toHaveLength(1) // One call in the batch

      const bypasserExecutedExternal = externalsFromTimelock[0]
      expect(bypasserExecutedExternal.info.dest?.value.toString(16)).toEqual(
        rbactl.opcodes.out.BypasserCallExecuted.toString(16),
      )

      const opcode = bypasserExecutedExternal.body.beginParse().preloadUint(32)
      const bypasserExecutedEvent = rbactl.builder.message.out.bypasserCallExecuted.decode(
        bypasserExecutedExternal.body,
      )

      expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.BypasserCallExecuted.toString(16))
      expect(bypasserExecutedEvent.queryId).toEqual(1)
      expect(bypasserExecutedEvent.index).toEqual(0)
      expect(bypasserExecutedEvent.target.equals(baseTest.bind.counter.address)).toBeTruthy()
      expect(bypasserExecutedEvent.value).toEqual(toNano('0.05'))
      expect(bypasserExecutedEvent.data.equals(incrementCall.data)).toBeTruthy()

      // Verify counter was incremented
      expect(await baseTest.bind.counter.getValue()).toEqual(1) // TODO this should be newCount when setcount is added in the TODO above
    })

    it('should allow admin to execute batch operations', async () => {
      // TODO this test is missing from the original suite
      const incrementCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      }
      const calls = BaseTestSetup.singletonCalls(incrementCall)

      const body = rbactl.builder.message.in.bypasserExecuteBatch.encode({
        queryId: 1n,
        calls,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('1'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.admin.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })

      // Check for Timelock_BypasserCallExecuted events
      const externalsFromTimelock = result.externals.filter((e) => {
        return e.info.src.equals(baseTest.bind.timelock.address)
      })

      expect(externalsFromTimelock).toHaveLength(1) // One call in the batch

      const bypasserExecutedExternal = externalsFromTimelock[0]
      expect(bypasserExecutedExternal.info.dest?.value.toString(16)).toEqual(
        rbactl.opcodes.out.BypasserCallExecuted.toString(16),
      )

      const opcode = bypasserExecutedExternal.body.beginParse().preloadUint(32)
      const bypasserExecutedEvent = rbactl.builder.message.out.bypasserCallExecuted.decode(
        bypasserExecutedExternal.body,
      )

      expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.BypasserCallExecuted.toString(16))
      expect(bypasserExecutedEvent.queryId).toEqual(1)
      expect(bypasserExecutedEvent.index).toEqual(0)
      expect(bypasserExecutedEvent.target.equals(baseTest.bind.counter.address)).toBeTruthy()
      expect(bypasserExecutedEvent.value).toEqual(toNano('0.05'))
      expect(bypasserExecutedEvent.data.equals(incrementCall.data)).toBeTruthy()

      // Verify counter was incremented
      expect(await baseTest.bind.counter.getValue()).toEqual(1) // TODO this should be newCount when setcount is added in the TODO above
    })
  })

  describe('Regular Execute Batch Tests', () => {
    it('should fail if non-executor tries to execute batch', async () => {
      // TODO What is test_cannotBeExecutedByNonExecutorIfRestrictionsSet
      const calls = BaseTestSetup.singletonCalls({
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      })

      const body = rbactl.builder.message.in.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      // Try with proposer role (should fail)
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

    it('should fail if operation is not ready', async () => {
      const calls = BaseTestSetup.singletonCalls({
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      })

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch.encode({
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

      expect(scheduleResult.transactions).toHaveTransaction({
        from: baseTest.acc.proposerOne.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })

      // Try to execute before delay is met (only advance a short time)
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY - 2n * 24n * 60n * 60n)) // 2 days short

      const executeBody = rbactl.builder.message.in.executeBatch.encode({
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
        success: false,
        exitCode: rbactl.Errors.OperationNotReady,
      })
    })

    it('should fail if predecessor operation not executed', async () => {
      const predecessorCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      }
      const predecessorCalls = BaseTestSetup.singletonCalls(predecessorCall)

      {
        // Schedule predecessor operation
        const scheduleCall = rbactl.builder.message.in.scheduleBatch.encode({
          queryId: 1n,
          calls: predecessorCalls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })

        await baseTest.bind.timelock.sendInternal(
          baseTest.acc.proposerOne.getSender(),
          toNano('0.05'),
          scheduleCall,
        )
      }

      // Get predecessor operation ID
      const predecessorBatch: rbactl.OperationBatch = {
        calls: predecessorCalls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const predecessorId = await baseTest.bind.timelock.getHashOperationBatch(predecessorBatch)

      // Schedule dependent operation
      const dependentCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.setCount.encode({
          queryId: 2n,
          newCount: 5,
        }),
      }
      const dependentCalls = BaseTestSetup.singletonCalls(dependentCall)

      {
        const scheduleBody = rbactl.builder.message.in.scheduleBatch.encode({
          queryId: 2n,
          calls: dependentCalls,
          predecessor: predecessorId,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })

        await baseTest.bind.timelock.sendInternal(
          baseTest.acc.proposerOne.getSender(),
          toNano('0.05'),
          scheduleBody,
        )
      }

      // Wait for delay but don't execute predecessor
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY + 2n * 24n * 60n * 60n)) // 2 days extra

      // Try to execute dependent operation (should fail)
      const executeBody = rbactl.builder.message.in.executeBatch.encode({
        queryId: 3n,
        calls: dependentCalls,
        predecessor: predecessorId,
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
        success: false,
        exitCode: rbactl.Errors.OperationMissingDependency,
      })
    })

    // TODO: Timelock doesn't handle reverts yet, and we do not know if it will")
    it.skip('should fail if one target call fails', async () => {
      // Create a call with invalid data
      const invalidCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: beginCell().storeUint(0x99999999, 32).endCell(), // Invalid opcode
      }
      const calls = BaseTestSetup.singletonCalls(invalidCall)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
        delay: BaseTestSetup.MIN_DELAY,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY + 2n * 24n * 60n * 60n))

      // Try to execute (should fail due to invalid call)
      const executeBody = rbactl.builder.message.in.executeBatch.encode({
        queryId: 2n,
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
        success: false,
      })
    })

    it('should allow executor to execute scheduled operation', async () => {
      await executeOperationTest(baseTest.acc.executorOne)
    })

    it('should allow admin to execute scheduled operation', async () => {
      await executeOperationTest(baseTest.acc.admin)
    })

    async function executeOperationTest(executor: SandboxContract<TreasuryContract>) {
      const setCountCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.setCount.encode({
          queryId: 1n,
          newCount: 10,
        }),
      }
      const calls = BaseTestSetup.singletonCalls(setCountCall)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
        delay: BaseTestSetup.MIN_DELAY,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY + 1n))

      // Execute operation
      const executeBody = rbactl.builder.message.in.executeBatch.encode({
        queryId: 2n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      const result = await baseTest.bind.timelock.sendInternal(
        executor.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: executor.address,
        to: baseTest.bind.timelock.address,
        success: true,
      })

      // Check for Timelock_CallExecuted events
      const externalsFromTimelock = result.externals.filter((e) => {
        return e.info.src.equals(baseTest.bind.timelock.address)
      })

      expect(externalsFromTimelock).toHaveLength(1) // One call in the batch

      const callExecutedExternal = externalsFromTimelock[0]
      expect(callExecutedExternal.info.dest?.value.toString(16)).toEqual(
        rbactl.opcodes.out.CallExecuted.toString(16),
      )

      const opcode = callExecutedExternal.body.beginParse().preloadUint(32)
      const callExecutedEvent = rbactl.builder.message.out.callExecuted.decode(
        callExecutedExternal.body,
      )

      expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.CallExecuted.toString(16))
      expect(callExecutedEvent.queryId).toEqual(2)
      expect(callExecutedEvent.index).toEqual(0)
      expect(callExecutedEvent.target.equals(baseTest.bind.counter.address)).toBeTruthy()
      expect(callExecutedEvent.value).toEqual(toNano('0.05'))
      expect(callExecutedEvent.data.equals(setCountCall.data)).toBeTruthy()

      // Verify operation was marked as done
      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationId = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      // Verify the operation ID in the event matches
      expect(callExecutedEvent.id).toEqual(operationId)
      const timestamp = await baseTest.bind.timelock.getTimestamp(operationId)
      expect(timestamp).toEqual(BaseTestSetup.DONE_TIMESTAMP)

      // Verify counter value was set
      expect(await baseTest.bind.counter.getValue()).toEqual(10)
    }
  })

  // TODO test Callproxy first')
  describe.skip('Call Proxy Execute Tests', () => {
    it('should execute through valid call proxy', async () => {
      const incrementCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      }
      const calls = BaseTestSetup.singletonCalls(incrementCall)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
        delay: BaseTestSetup.MIN_DELAY,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY + 1n))

      // Grant executor role to call proxy
      const grantRoleBody = ac.builder.message.in.grantRole.encode({
        queryId: 1n,
        role: rbactl.roles.executor,
        account: baseTest.bind.callProxy.address,
      })

      await baseTest.bind.ac.sendInternal(
        baseTest.acc.admin.getSender(),
        toNano('0.05'),
        grantRoleBody,
      )

      // Execute through call proxy using external caller
      const executeBody = rbactl.builder.message.in.executeBatch.encode({
        queryId: 2n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      // Execute via call proxy
      const proxyResult = await baseTest.bind.callProxy.sendInternal(
        baseTest.acc.deployer.getSender(), // External caller
        toNano('1'),
        executeBody,
      )

      expect(proxyResult.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.callProxy.address,
        success: true,
      })

      // Verify counter was incremented
      expect(await baseTest.bind.counter.getValue()).toEqual(1)
    })

    it('should fail if call proxy is not executor', async () => {
      const incrementCall: rbactl.Call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }),
      }
      const calls = BaseTestSetup.singletonCalls(incrementCall)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
        delay: BaseTestSetup.MIN_DELAY,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY + 1n))

      // Try to execute through call proxy without granting executor role
      const executeBody = rbactl.builder.message.in.executeBatch.encode({
        queryId: 2n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      const proxyResult = await baseTest.bind.callProxy.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('1'),
        executeBody,
      )

      // The call proxy should fail to execute because it doesn't have executor role
      expect(proxyResult.transactions).toHaveTransaction({
        from: baseTest.bind.callProxy.address,
        to: baseTest.bind.timelock.address,
        success: false,
        exitCode: ac.Errors.UnauthorizedAccount,
      })
    })
  })
})
