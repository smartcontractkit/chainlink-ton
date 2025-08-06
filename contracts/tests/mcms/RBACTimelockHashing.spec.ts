import '@ton/test-utils'

import { Address, toNano } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'

import { BaseTestSetup, TestCode } from './BaseTest'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

describe('MCMS - RBACTimelockHashingTest', () => {
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

  it('should hash batch operation correctly', async () => {
    // TODO the original test creates a vec of 2 calls
    // let callVec: rbactl.Call[] = []
    // callVec.push(baseTest.createIncrementCall())
    // callVec.push(baseTest.createIncrementCall())
    // const calls = encodeBatch(callVec)
    const calls = BaseTestSetup.singletonCalls(baseTest.createIncrementCall())

    // Schedule operation
    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
      delay: BaseTestSetup.MIN_DELAY,
    })

    // Get operation ID
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: BaseTestSetup.NO_PREDECESSOR,
      salt: BaseTestSetup.EMPTY_SALT,
    }
    const hashedOperation = await baseTest.bind.timelock.getHashOperationBatch(operationBatch)

    const offchainId = rbactl.builder.data.operationBatch.encode(operationBatch).hash()
    const expectedHash = BigInt('0x' + offchainId.toString('hex'))

    expect(hashedOperation).toEqual(expectedHash)
  })
})
