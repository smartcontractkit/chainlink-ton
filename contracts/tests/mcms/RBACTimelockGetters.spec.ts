import '@ton/test-utils'

import { toNano } from '@ton/core'

import { rbactl } from '../../wrappers/mcms'
import * as counter from '../../wrappers/examples/Counter'

import { BaseTestSetup, TestCode } from './BaseTest'

describe('MCMS - RBACTimelockGetters', () => {
  let baseTest: BaseTestSetup

  beforeAll(async () => {
    baseTest = await BaseTestSetup.beforeAll('getter')
  })

  beforeEach(async () => {
    await baseTest.beforeEach()
  })

  describe('isOperation', () => {
    it('should return false if not an operation', async () => {
      const nonOperation = 12345n
      const isOperation = await baseTest.bind.timelock.isOperation(nonOperation)
      expect(isOperation).toBe(false)
    })

    it('should return true if an operation', async () => {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

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
      const nonOperation = 12345n
      const isOperationPending = await baseTest.bind.timelock.isOperationPending(nonOperation)
      expect(isOperationPending).toBe(false)
    })

    it('should return true if scheduled operation not yet executed', async () => {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay and execute
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY))

      const executeBody = rbactl.builder.message.in.executeBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('0.1'),
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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Warp to exactly the delay time
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY))

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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay and execute
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY))

      const executeBody = rbactl.builder.message.in.executeBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('0.1'),
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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay and execute
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY))

      const executeBody = rbactl.builder.message.in.executeBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('0.1'),
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
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.05'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      const scheduleTime = baseTest.blockchain.now!!

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

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

      const operationTimestamp = await baseTest.bind.timelock.getTimestamp(operationID)
      expect(operationTimestamp).toBe(BigInt(scheduleTime) + BigInt(BaseTestSetup.MIN_DELAY))
    })

    it('should return DONE_TIMESTAMP if operation has been executed', async () => {
      const call = {
        target: baseTest.bind.counter.address,
        value: toNano('0.12'),
        data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
      }
      const calls = BaseTestSetup.singletonCalls(call)

      // Schedule operation
      const scheduleBody = rbactl.builder.message.in.scheduleBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
          delay: BaseTestSetup.MIN_DELAY,
        })
        .asCell()

      await baseTest.bind.timelock.sendInternal(
        baseTest.acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      // Wait for delay and execute
      baseTest.warpTime(Number(BaseTestSetup.MIN_DELAY))

      const executeBody = rbactl.builder.message.in.executeBatch
        .encode({
          queryId: 1n,
          calls,
          predecessor: BaseTestSetup.NO_PREDECESSOR,
          salt: BaseTestSetup.EMPTY_SALT,
        })
        .asCell()

      const r = await baseTest.bind.timelock.sendInternal(
        baseTest.acc.executorOne.getSender(),
        toNano('0.2'),
        executeBody,
      )

      expect(r.transactions).toHaveTransaction({
        from: baseTest.acc.executorOne.getSender().address,
        to: baseTest.bind.timelock.address,
        success: true,
      })

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      }
      const operationID = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

      const operationTimestamp = await baseTest.bind.timelock.getTimestamp(operationID)
      expect(operationTimestamp).toBe(rbactl.DONE_TIMESTAMP)
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await baseTest.generateCoverageArtifacts()
    }
  })
})
