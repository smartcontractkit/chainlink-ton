import '@ton/test-utils'
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals'
import { toNano, Address } from '@ton/core'
import { LockReleaseTokenPoolSetup } from './LockReleaseTokenPoolSetup'
import { ZERO_ADDRESS } from '../../src/utils'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { TestCode } from './BaseTest'

describe('LockReleaseTokenPool - setRebalancer', () => {
  let baseTest: LockReleaseTokenPoolSetup
  let code: TestCode

  beforeAll(async () => {
    code = await LockReleaseTokenPoolSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new LockReleaseTokenPoolSetup()
    baseTest.code = code
    await baseTest.setUp('test-set-rebalancer')
  })

  it('sanity check', async () => {
    expect(baseTest).toBeDefined()
  })

  it('should set rebalancer successfully', async () => {
    // Test equivalent to test_SetRebalancer() in Solidity

    // Check initial rebalancer (should be OWNER from setUp)
    const initialRebalancer = await baseTest.bind.lockReleaseTokenPool.getRebalancer()
    expect(initialRebalancer.equals(baseTest.acc.owner.address)).toBe(true)

    // Set new rebalancer to STRANGER
    const setRebalancerResult = await baseTest.bind.lockReleaseTokenPool.sendSetRebalancer(
      baseTest.acc.owner.getSender(),
      toNano('0.05'),
      {
        queryId: 1n,
        rebalancer: baseTest.acc.stranger.address,
      },
    )

    console.log('setRebalancerResult', setRebalancerResult.transactions)
    // Verify transaction succeeded
    // expect(setRebalancerResult.transactions).toHaveTransaction({
    //   from: baseTest.acc.owner.address,
    //   to: baseTest.bind.lockReleaseTokenPool.address,
    //   success: true,
    // })

    // TODO: Verify RebalancerSet event was emitted when event parsing is available
    // expect(setRebalancerResult.transactions).toHaveTransaction({
    //   from: testSetup.acc.owner.address,
    //   to: testSetup.bind.lockReleaseTokenPool.address,
    //   success: true,
    //   outMessagesCount: 1,
    //   body: expect.objectContaining({
    //     type: 'rebalancer-set-event',
    //     oldRebalancer: testSetup.acc.owner.address,
    //     newRebalancer: testSetup.acc.stranger.address,
    //   }),
    // })

    // Verify rebalancer was actually changed
    const newRebalancer = await baseTest.bind.lockReleaseTokenPool.getRebalancer()
    expect(newRebalancer.equals(baseTest.acc.stranger.address)).toBe(true)
  })

  // it('should revert when non-owner tries to set rebalancer', async () => {
  //   // Test equivalent to test_SetRebalancer_RevertWhen_OnlyCallableByOwner() in Solidity

  //   // Attempt to set rebalancer from non-owner account (STRANGER)
  //   const setRebalancerResult = await baseTest.bind.lockReleaseTokenPool.sendSetRebalancer(
  //     baseTest.acc.stranger.getSender(), // Using stranger instead of owner
  //     toNano('0.05'),
  //     {
  //       queryId: 1n,
  //       rebalancer: baseTest.acc.stranger.address,
  //     },
  //   )

  //   // Verify transaction failed with proper error
  //   expect(setRebalancerResult.transactions).toHaveTransaction({
  //     from: baseTest.acc.stranger.address,
  //     to: baseTest.bind.lockReleaseTokenPool.address,
  //     success: false,
  //     // TODO: Add specific exit code check when Ownable2Step error codes are available
  //     // exitCode: ownable2step.Error.OnlyCallableByOwner,
  //   })

  //   // Verify rebalancer was NOT changed (should still be owner)
  //   const currentRebalancer = await baseTest.bind.lockReleaseTokenPool.getRebalancer()
  //   expect(currentRebalancer.equals(baseTest.acc.owner.address)).toBe(true)
  // })

  // it('should allow setting rebalancer to zero address (disable rebalancer)', async () => {
  //   // Additional test case - setting rebalancer to null/zero address should be allowed
  //   const zeroAddress = ZERO_ADDRESS

  //   const setRebalancerResult = await baseTest.bind.lockReleaseTokenPool.sendSetRebalancer(
  //     baseTest.acc.owner.getSender(),
  //     toNano('0.05'),
  //     {
  //       queryId: 1n,
  //       rebalancer: zeroAddress, // Setting to zero address to disable
  //     },
  //   )

  //   // Verify transaction succeeded
  //   expect(setRebalancerResult.transactions).toHaveTransaction({
  //     from: baseTest.acc.owner.address,
  //     to: baseTest.bind.lockReleaseTokenPool.address,
  //     success: true,
  //   })

  //   // Verify rebalancer was set to zero address
  //   const newRebalancer = await baseTest.bind.lockReleaseTokenPool.getRebalancer()
  //   expect(newRebalancer.equals(zeroAddress)).toBe(true)
  // })

  // it('should emit RebalancerSet event with correct parameters', async () => {
  //   // Test for proper event emission (when event parsing is available)
  //   const oldRebalancer = await baseTest.bind.lockReleaseTokenPool.getRebalancer()
  //   const newRebalancer = baseTest.acc.rebalancer.address

  //   const setRebalancerResult = await baseTest.bind.lockReleaseTokenPool.sendSetRebalancer(
  //     baseTest.acc.owner.getSender(),
  //     toNano('0.05'),
  //     {
  //       queryId: 1n,
  //       rebalancer: newRebalancer,
  //     },
  //   )

  //   // Verify transaction succeeded
  //   expect(setRebalancerResult.transactions).toHaveTransaction({
  //     from: baseTest.acc.owner.address,
  //     to: baseTest.bind.lockReleaseTokenPool.address,
  //     success: true,
  //   })

  //   // TODO: Add event verification when event parsing infrastructure is available
  //   // This should verify that a RebalancerSet event was emitted with:
  //   // - oldRebalancer: oldRebalancer address
  //   // - newRebalancer: newRebalancer address
  //   //
  //   // Example:
  //   // const events = parseEvents(setRebalancerResult.transactions)
  //   // const rebalancerSetEvent = events.find(e => e.type === 'RebalancerSet')
  //   // expect(rebalancerSetEvent).toBeDefined()
  //   // expect(rebalancerSetEvent.oldRebalancer.equals(oldRebalancer)).toBe(true)
  //   // expect(rebalancerSetEvent.newRebalancer.equals(newRebalancer)).toBe(true)

  //   console.warn(
  //     'Event verification not yet implemented - waiting for event parsing infrastructure',
  //   )
  // })
})
