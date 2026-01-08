import '@ton/test-utils'
import { Cell, toNano } from '@ton/core'

import { BaseTestSetup, TestCode } from './BaseTest'

describe('MCMS - RBACTimelockReceivable', () => {
  let baseTest: BaseTestSetup

  beforeAll(async () => {
    baseTest = await BaseTestSetup.beforeAll('receivable')
  })

  beforeEach(async () => {
    await baseTest.beforeEach()
  })

  it('should be able to receive TON', async () => {
    const contractBefore = await baseTest.blockchain.getContract(baseTest.bind.timelock.address)
    const balanceBefore = await contractBefore.account.account?.storage.balance!

    const transferAmount = toNano('0.5')
    const result = await baseTest.bind.timelock.sendInternal(
      baseTest.acc.admin.getSender(),
      transferAmount,
      Cell.EMPTY,
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

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await baseTest.generateCoverageArtifacts()
    }
  })
})
