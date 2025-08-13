import '@ton/test-utils'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as ac from '../../wrappers/lib/access/AccessControl'

import { BaseTestSetup, TestCode } from './BaseTest'

describe('MCMS - RBACTimelockConstructorTest', () => {
  let baseTest: BaseTestSetup
  let code: TestCode

  beforeAll(async () => {
    code = await BaseTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new BaseTestSetup()
    baseTest.code = code
    await baseTest.setupAll('test-constructor')
  })

  it('should set admin role', async () => {
    const hasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.admin.address,
    )
    expect(hasAdminRole).toBe(true)
  })

  it('should ensure proposers do not have admin role', async () => {
    const proposerOneHasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.proposerOne.address,
    )
    const proposerTwoHasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.proposerTwo.address,
    )

    expect(proposerOneHasAdminRole).toBe(false)
    expect(proposerTwoHasAdminRole).toBe(false)
  })

  it('should ensure executors do not have admin role', async () => {
    const executorOneHasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.executorOne.address,
    )
    const executorTwoHasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.executorTwo.address,
    )

    expect(executorOneHasAdminRole).toBe(false)
    expect(executorTwoHasAdminRole).toBe(false)
  })

  it('should ensure cancellers do not have admin role', async () => {
    const cancellerOneHasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.cancellerOne.address,
    )
    const cancellerTwoHasAdminRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.admin,
      baseTest.acc.cancellerTwo.address,
    )

    expect(cancellerOneHasAdminRole).toBe(false)
    expect(cancellerTwoHasAdminRole).toBe(false)
  })

  it('should set proposer roles', async () => {
    const proposerOneHasRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.proposerOne.address,
    )
    const proposerTwoHasRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.proposerTwo.address,
    )

    expect(proposerOneHasRole).toBe(true)
    expect(proposerTwoHasRole).toBe(true)
  })

  it('should ensure admin does not have proposer role', async () => {
    const adminHasProposerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.admin.address,
    )
    expect(adminHasProposerRole).toBe(false)
  })

  it('should ensure executors do not have proposer role', async () => {
    const executorOneHasProposerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.executorOne.address,
    )
    const executorTwoHasProposerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.executorTwo.address,
    )

    expect(executorOneHasProposerRole).toBe(false)
    expect(executorTwoHasProposerRole).toBe(false)
  })

  it('should ensure cancellers do not have proposer role', async () => {
    const cancellerOneHasProposerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.cancellerOne.address,
    )
    const cancellerTwoHasProposerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.proposer,
      baseTest.acc.cancellerTwo.address,
    )

    expect(cancellerOneHasProposerRole).toBe(false)
    expect(cancellerTwoHasProposerRole).toBe(false)
  })

  it('should set executor roles', async () => {
    const executorOneHasRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.executorOne.address,
    )
    const executorTwoHasRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.executorTwo.address,
    )

    expect(executorOneHasRole).toBe(true)
    expect(executorTwoHasRole).toBe(true)
  })

  it('should ensure admin does not have executor role', async () => {
    const adminHasExecutorRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.admin.address,
    )
    expect(adminHasExecutorRole).toBe(false)
  })

  it('should ensure proposers do not have executor role', async () => {
    const proposerOneHasExecutorRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.proposerOne.address,
    )
    const proposerTwoHasExecutorRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.proposerTwo.address,
    )

    expect(proposerOneHasExecutorRole).toBe(false)
    expect(proposerTwoHasExecutorRole).toBe(false)
  })

  it('should ensure cancellers do not have executor role', async () => {
    const cancellerOneHasExecutorRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.cancellerOne.address,
    )
    const cancellerTwoHasExecutorRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.executor,
      baseTest.acc.cancellerTwo.address,
    )

    expect(cancellerOneHasExecutorRole).toBe(false)
    expect(cancellerTwoHasExecutorRole).toBe(false)
  })

  it('should set canceller roles', async () => {
    const cancellerOneHasRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.cancellerOne.address,
    )
    const cancellerTwoHasRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.cancellerTwo.address,
    )

    expect(cancellerOneHasRole).toBe(true)
    expect(cancellerTwoHasRole).toBe(true)
  })

  it('should ensure admin does not have canceller role', async () => {
    const adminHasCancellerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.admin.address,
    )
    expect(adminHasCancellerRole).toBe(false)
  })

  it('should ensure executors do not have canceller role', async () => {
    const executorOneHasCancellerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.executorOne.address,
    )
    const executorTwoHasCancellerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.executorTwo.address,
    )

    expect(executorOneHasCancellerRole).toBe(false)
    expect(executorTwoHasCancellerRole).toBe(false)
  })

  it('should ensure proposers do not have canceller role', async () => {
    const proposerOneHasCancellerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.proposerOne.address,
    )
    const proposerTwoHasCancellerRole = await baseTest.bind.ac.getHasRole(
      rbactl.roles.canceller,
      baseTest.acc.proposerTwo.address,
    )

    expect(proposerOneHasCancellerRole).toBe(false)
    expect(proposerTwoHasCancellerRole).toBe(false)
  })

  it('should set min delay', async () => {
    const minDelay = await baseTest.bind.timelock.getMinDelay()
    expect(minDelay).toBe(BigInt(BaseTestSetup.MIN_DELAY))
  })

  it('should have no blocked functions initially', async () => {
    const numBlockedFns = await baseTest.bind.timelock.getBlockedFunctionSelectorCount()
    expect(numBlockedFns).toBe(0)
  })
})
