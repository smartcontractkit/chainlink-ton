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
      exitCode: ac.Errors.UnauthorizedAccount,
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

    // TBD Timelock docs says it emits Timelock_MinDelayChange but it is replying it instead of emiting
    // // Check for Timelock_MinDelayChange event
    // const externalsFromTimelock = result.externals.filter((e) => {
    //   return e.info.src.equals(baseTest.bind.timelock.address)
    // })

    // expect(externalsFromTimelock).toHaveLength(1)

    // const delayChangeExternal = externalsFromTimelock[0]
    // expect(delayChangeExternal.info.dest?.value.toString(16)).toEqual(
    //   rbactl.opcodes.out.MinDelayChange.toString(16),
    // )

    // const opcode = delayChangeExternal.body.beginParse().preloadUint(32)
    // const delayChangeEvent = rbactl.builder.event.minDelayChange.decode(delayChangeExternal.body)

    // expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.MinDelayChange.toString(16))
    // expect(delayChangeEvent.queryId).toEqual(1)
    // expect(delayChangeEvent.oldDelay).toEqual(BaseTestSetup.MIN_DELAY)
    // expect(delayChangeEvent.newDelay).toEqual(newDelay)

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
