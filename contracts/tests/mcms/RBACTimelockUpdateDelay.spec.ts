import '@ton/test-utils'

import { toNano } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as ac from '../../wrappers/lib/access/AccessControl'

import { BaseTestSetup, TestCode } from './BaseTest'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

describe('MCMS - RBACTimelockUpdateDelayTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-update-delay')
  })

  const newDelay = 3 * 24 * 60 * 60 // 3 days in seconds

  it('should fail if non-admin tries to update delay', async () => {
    // Try to update delay with proposer role (should fail)
    const result = await updateTimelockDelay(baseTest.acc.proposerOne)

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.proposerOne.address,
      to: baseTest.bind.timelock.address,
      success: false,
      exitCode: ac.errors.UnouthorizedAccount,
    })
  })

  it('should update min delay', async () => {
    // Update delay with admin role
    const result = await updateTimelockDelay(baseTest.acc.admin)

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.admin.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    // Verify the delay was updated
    const minDelay = await baseTest.bind.timelock.getMinDelay()
    expect(minDelay).toBe(BigInt(newDelay))
  })

  async function updateTimelockDelay(sender: SandboxContract<TreasuryContract>) {
    const body = rbactl.builder.message.updateDelay.encode({
      queryId: 1n,
      newDelay,
    })

    const result = await baseTest.bind.timelock.sendInternal(
      sender.getSender(),
      toNano('0.05'),
      body,
    )
    return result
  }
})
