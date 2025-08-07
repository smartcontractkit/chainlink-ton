import '@ton/test-utils'

import { Address, toNano } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'

import { BaseTestSetup, TestCode } from './BaseTest'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

describe('MCMS - RBACTimelockGetters', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-getters')
  })

  describe('isOperation', () => {
    it('should return false if not an operation', async () => {
      const nonOperation = 12345n
      const isOperation = await baseTest.bind.timelock.isOperation(nonOperation)
      expect(isOperation).toBe(false)
    })

    it('should return true if an operation', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperation = await baseTest.bind.timelock.isOperation(operationID)
      expect(isOperation).toBe(true)
    })
  })

  describe('isOperationPending', () => {
    it('should return false if not an operation', async () => {
      const nonOperation = 12345n // TODO rewrite as bytes ot non-op
      const isOperationPending = await baseTest.bind.timelock.isOperationPending(nonOperation)
      expect(isOperationPending).toBe(false)
    })

    it('should return true if scheduled operation not yet executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationPending = await baseTest.bind.timelock.isOperationPending(operationID)
      expect(isOperationPending).toBe(true)
    })

    it('should return false if operation has been executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Wait for delay and execute
      baseTest.warpTime(BaseTestSetup.MIN_DELAY)

      const executeBody = rbactl.builder.message.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('1'),
        executeBody,
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationPending = await baseTest.bind.timelock.isOperationPending(operationID)
      expect(isOperationPending).toBe(false)
    })
  })

  describe('isOperationReady', () => {
    it('should return false if not an operation', async () => {
      const nonOperation = 12345n
      const isOperationReady = await baseTest.bind.timelock.isOperationReady(nonOperation)
      expect(isOperationReady).toBe(false)
    })

    it('should return true if on the delayed execution time', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Warp to exactly the delay time
      baseTest.warpTime(BaseTestSetup.MIN_DELAY) // TODO + 1?

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationReady = await baseTest.bind.timelock.isOperationReady(operationID)
      expect(isOperationReady).toBe(true)
    })

    it('should return true if after the delayed execution time', async () => {
      // TODO I dont fully get the difference with the test above
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Warp past the delay time (1 day extra)
      baseTest.warpTime(BaseTestSetup.MIN_DELAY + 24 * 60 * 60)

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationReady = await baseTest.bind.timelock.isOperationReady(operationID)
      expect(isOperationReady).toBe(true)
    })

    it('should return false if before the delayed execution time', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Warp to before the delay time (1 day before)
      baseTest.warpTime(BaseTestSetup.MIN_DELAY - 24 * 60 * 60)

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationReady = await baseTest.bind.timelock.isOperationReady(operationID)
      expect(isOperationReady).toBe(false)
    })

    it('should return false if operation has been executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Wait for delay and execute
      baseTest.warpTime(BaseTestSetup.MIN_DELAY)

      const executeBody = rbactl.builder.message.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('1'),
        executeBody,
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationReady = await baseTest.bind.timelock.isOperationReady(operationID)
      expect(isOperationReady).toBe(false)
    })
  })

  describe('isOperationDone', () => {
    it('should return false if not an operation', async () => {
      const nonOperation = 12345n
      const isOperationDone = await baseTest.bind.timelock.isOperationDone(nonOperation)
      expect(isOperationDone).toBe(false)
    })

    it('should return false if the operation has not been executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationDone = await baseTest.bind.timelock.isOperationDone(operationID)
      expect(isOperationDone).toBe(false)
    })

    it('should return true if operation has been executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Wait for delay and execute
      baseTest.warpTime(BaseTestSetup.MIN_DELAY)

      const executeBody = rbactl.builder.message.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('1'),
        executeBody,
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const isOperationDone = await baseTest.bind.timelock.isOperationDone(operationID)
      expect(isOperationDone).toBe(true)
    })
  })

  describe('getTimestamp', () => {
    it('should return zero if not an operation', async () => {
      const nonOperation = 12345n
      const operationTimestamp = await baseTest.bind.timelock.getTimestamp(nonOperation)
      expect(operationTimestamp).toBe(0n)
    })

    it('should return the correct timestamp if the operation has not been executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      const scheduleTime = baseTest.blockchain.now!!

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      // TODO Should we warp time here so we are sure the timestamp is correct?

      const operationTimestamp = await baseTest.bind.timelock.getTimestamp(operationID)
      expect(operationTimestamp).toBe(BigInt(scheduleTime + BaseTestSetup.MIN_DELAY)) // TODO or maybe a range?
    })

    it('should return DONE_TIMESTAMP if operation has been executed', async () => {
      const call = baseTest.createIncrementCall()
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
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

      // Wait for delay and execute
      baseTest.warpTime(BaseTestSetup.MIN_DELAY)

      const executeBody = rbactl.builder.message.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('1'),
        executeBody,
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const operationTimestamp = await baseTest.bind.timelock.getTimestamp(operationID)
      expect(operationTimestamp).toBe(BigInt(BaseTestSetup.DONE_TIMESTAMP))
    })
  })
})
