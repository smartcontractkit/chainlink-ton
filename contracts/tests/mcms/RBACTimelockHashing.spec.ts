import '@ton/test-utils'

import { asSnakeData } from '../../utils'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as counter from '../../wrappers/examples/Counter'

import { BaseTestSetup, TestCode } from './BaseTest'

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
    const calls = asSnakeData<rbactl.Call>(
      [
        {
          target: baseTest.bind.counter.address,
          value: 0n,
          data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
        },
        {
          target: baseTest.bind.counter.address,
          value: 0n,
          data: counter.builder.message.increaseCount.encode({ queryId: 2n }),
        },
      ],
      (c) => rbactl.builder.data.call.encode(c).asBuilder(),
    )

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
