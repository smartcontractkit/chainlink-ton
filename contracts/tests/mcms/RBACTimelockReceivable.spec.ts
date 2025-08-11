import '@ton/test-utils'

import { toNano } from '@ton/core'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'

import { BaseTestSetup, TestCode } from './BaseTest'

describe('MCMS - RBACTimelockReceivable', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-receivable')
  })

  it('should be able to receive TON', async () => {
    const contractBefore = await baseTest.blockchain.getContract(baseTest.bind.timelock.address)
    const balanceBefore = await contractBefore.account.account?.storage.balance!

    const topUpBody = rbactl.builder.message.topUp.encode({
      queryId: 1n,
    })

    const transferAmount = toNano('0.5')

    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.admin.getSender(),
      transferAmount,
      topUpBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.admin.address,
      to: baseTest.bind.timelock.address,
      success: true,
    })

    expect(result.transactions.length).toEqual(2)
    const transferTransaction = result.transactions[1]
    expect(transferTransaction).toBeDefined()

    const contractAfter = await baseTest.blockchain.getContract(baseTest.bind.timelock.address)
    const balanceAfter = await contractAfter.account.account?.storage.balance!

    expect(balanceAfter.coins).toEqual(
      balanceBefore.coins + transferAmount - transferTransaction.totalFees.coins,
    )
  })
})
