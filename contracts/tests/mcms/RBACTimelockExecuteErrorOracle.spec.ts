import '@ton/test-utils'

import { toNano, Cell } from '@ton/core'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as counter from '../../wrappers/examples/Counter'
import * as ac from '../../wrappers/lib/access/AccessControl'

import { BaseTestSetup, TestCode } from './BaseTest'

describe('MCMS - RBACTimelockExecuteErrorOracleTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode
  let counterTwo: SandboxContract<counter.ContractClient>

  let acc: {
    oracle: SandboxContract<TreasuryContract>
  }

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-execute-error-oracle')
    acc = { oracle: await baseTest.blockchain.treasury('oracle') }

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
    const result = await counterTwo.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('0.05'),
      Cell.EMPTY,
    )
    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: counterTwo.address,
      success: true,
    })
  })

  const _setupOracleRole = async () => {
    const r = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.admin.getSender(),
      toNano('0.1'),
      ac.builder.message.in.grantRole
        .encode({
          queryId: 1n,
          role: rbactl.roles.oracle,
          account: acc.oracle.address,
        })
        .asCell(),
    )

    expect(r.transactions).toHaveTransaction({
      from: baseTest.acc.admin.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    expect(await baseTest.bind.ac.getHasRole(rbactl.roles.oracle, acc.oracle.address)).toBe(true)
  }

  it('should allow admin to transfer oracle role', async () => {
    expect(await baseTest.bind.ac.getRoleMemberCount(rbactl.roles.oracle)).toEqual(0n)

    await _setupOracleRole()
  })

  it('should fail to transfer oracle role if not admin', async () => {
    expect(await baseTest.bind.ac.getRoleMemberCount(rbactl.roles.oracle)).toEqual(0n)

    const r = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      ac.builder.message.in.grantRole
        .encode({
          queryId: 1n,
          role: rbactl.roles.oracle,
          account: baseTest.acc.deployer.address,
        })
        .asCell(),
    )

    expect(r.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: ac.Error.UnauthorizedAccount,
    })

    expect(await baseTest.bind.ac.getRoleMemberCount(rbactl.roles.oracle)).toEqual(0n)
  })

  it('should allow oracle to submit an error report and mark op as error', async () => {
    await _setupOracleRole()

    // Execute first operation
    const incrementCall: rbactl.Call = {
      target: baseTest.bind.counter.address,
      value: toNano('0.12'),
      data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
    }
    const calls = BaseTestSetup.singletonCalls(incrementCall)

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

    // Wait for delay
    baseTest.warpTime(BaseTestSetup.MIN_DELAY + 1)

    const executeBody = rbactl.builder.message.in.executeBatch
      .encode({
        queryId: 2n,
        calls,
        predecessor: BaseTestSetup.NO_PREDECESSOR,
        salt: BaseTestSetup.EMPTY_SALT,
      })
      .asCell()

    const r = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.executorOne.getSender(), // External caller
      toNano('1'),
      executeBody,
    )

    expect(r.transactions).toHaveTransaction({
      from: baseTest.acc.executorOne.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    expect(r.transactions).toHaveTransaction({
      from: baseTest.bind.timelock.address,
      to: baseTest.bind.counter.address,
      success: true,
    })

    // Verify counter was incremented
    expect(await baseTest.bind.counter.getValue()).toEqual(1)

    // Verify operation was marked as done
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
    }
    const operationId = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)
    expect(await baseTest.bind.timelock.getTimestamp(operationId)).toEqual(rbactl.DONE_TIMESTAMP)

    // Submit an error report
    const txHash = BigInt('0x' + r.transactions[0].hash().toString('hex'))

    const r2 = await baseTest.bind.timelock.sendInternal(
      acc.oracle.getSender(), // Oracle caller
      toNano('0.12'),
      rbactl.builder.message.in.submitErrorReport
        .encode({
          queryId: 2n,
          opBatch: operationBatch,
          opTxHash: txHash,
          errorTxHash: txHash,
          errorCode: 1337,
        })
        .asCell(),
    )

    expect(r2.transactions).toHaveTransaction({
      from: acc.oracle.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    expect(await baseTest.bind.timelock.getTimestamp(operationId)).toEqual(rbactl.ERROR_TIMESTAMP)

    // Try to re-execute the same op - should fail with OperationNotReady
    const r3 = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.executorOne.getSender(), // External caller
      toNano('0.12'),
      executeBody,
    )

    expect(r3.transactions).toHaveTransaction({
      from: baseTest.acc.executorOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: rbactl.Error.OperationNotReady,
    })
  })
})
