import '@ton/test-utils'

import { Address, toNano } from '@ton/core'

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

    // Check for MinDelayChange confirmation
    const delayChangedTx = result.transactions.filter((t) => {
      const src = t.inMessage?.info.src! as Address
      return src && src.equals(baseTest.bind.timelock.address)
    })

    expect(delayChangedTx).toHaveLength(1)
    expect(delayChangedTx[0].inMessage).toBeDefined()

    const delayChangedMsg = delayChangedTx[0].inMessage!
    const opcode = delayChangedMsg.body.beginParse().preloadUint(32)
    const delayChangedConfirmation = rbactl.builder.event.minDelayChange.decode(
      delayChangedMsg.body,
    )

    expect(opcode.toString(16)).toEqual(rbactl.opcodes.out.MinDelayChange.toString(16))
    expect(delayChangedConfirmation.queryId).toEqual(1)
    expect(delayChangedConfirmation.oldDelay).toEqual(BaseTestSetup.MIN_DELAY)
    expect(delayChangedConfirmation.newDelay).toEqual(newDelay)

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
