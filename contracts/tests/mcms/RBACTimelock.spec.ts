import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as ac from '../../wrappers/lib/access/AccessControl'

describe('RBACTimelock', () => {
  let code: Cell

  beforeAll(async () => {
    code = await compile('mcms.RBACTimelock')
  })

  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let other: SandboxContract<TreasuryContract>

  // Contract bindings
  let acContract: SandboxContract<ac.ContractClient>
  let timelock: SandboxContract<rbactl.ContractClient>

  let minDelay: number
  let scheduleSnapshot: BlockchainSnapshot
  let scheduleId: bigint
  let executeData: rbactl.ExecuteData

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    other = await blockchain.treasury('other')
    minDelay = 7

    const roleData: ac.ContractRoleData = {
      adminRole: rbactl.roles.admin, // default admin role
      membersLen: 1n, // one member (deployer)
      hasRole: ac.builder.data.encode().hasRoleDict([deployer.address]),
    }

    const rbacStorage: ac.ContractData = {
      roles: ac.builder.data.encode().rolesDict(
        new Map([
          [rbactl.roles.admin, roleData],
          [rbactl.roles.proposer, roleData],
          [rbactl.roles.canceller, roleData],
          [rbactl.roles.executor, roleData],
        ]),
      ),
    }

    const data = {
      minDelay: minDelay,
      rbac: ac.builder.data.encode().contractData(rbacStorage),
    }

    timelock = blockchain.openContract(rbactl.ContractClient.newFrom(data, code))
    acContract = blockchain.openContract(ac.ContractClient.newAt(timelock.address))
  })

  it('Should compute crc32 opcodes', async () => {
    // In opcodes
    expect(rbactl.opcodes.in.Init).toBe(0x4982fcfd)
    expect(rbactl.opcodes.in.TopUp).toBe(0xfee62ba6)
    expect(rbactl.opcodes.in.ScheduleBatch).toBe(0x94718f4)
    expect(rbactl.opcodes.in.Cancel).toBe(0xaf3bf1d0)
    expect(rbactl.opcodes.in.ExecuteBatch).toBe(0x6e9bf263)
    expect(rbactl.opcodes.in.UpdateDelay).toBe(0x7a57a45c)
    expect(rbactl.opcodes.in.BlockFunctionSelector).toBe(0x2637af77)
    expect(rbactl.opcodes.in.UnblockFunctionSelector).toBe(0x26f19f4e)
    expect(rbactl.opcodes.in.BypasserExecuteBatch).toBe(0xbb0e9f7d)

    // Out opcodes
    expect(rbactl.opcodes.out.CallScheduled).toBe(0xc55fca54)
    expect(rbactl.opcodes.out.CallExecuted).toBe(0x49ea5d0e)
    expect(rbactl.opcodes.out.BypasserCallExecuted).toBe(0x9c7f3010)
    expect(rbactl.opcodes.out.Canceled).toBe(0x580e80f2)
    expect(rbactl.opcodes.out.MinDelayChange).toBe(0x904b14e0)
    expect(rbactl.opcodes.out.FunctionSelectorBlocked).toBe(0x9c4d6d94)
    expect(rbactl.opcodes.out.FunctionSelectorUnblocked).toBe(0xf410a31b)
  })

  it('should deploy', async () => {
    const body = rbactl.builder.message.encode().topUp({ queryId: 1n })
    // Acts as a deploy
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      deploy: true,
      success: true,
    })

    expect(await acContract.getHasRole(rbactl.roles.admin, deployer.address)).toEqual(true)
    expect(await acContract.getRoleAdmin(rbactl.roles.admin)).toEqual(rbactl.roles.admin) // default admin role

    const memberAddr = await acContract.getRoleMember(rbactl.roles.admin, 0n)
    expect(memberAddr).not.toBeNull()
    expect(memberAddr!.toString()).toEqual(deployer.address.toString()) // default admin role

    // const timelockData = await getRBACTimelockData()
    // expect(timelockData.minDelay).toEqual(minDelay)
    // expect(timelockData.timestampCount).toEqual(0)
    // expect(timelockData.adminAccounts).not.toEqual(null)
    // expect(timelockData.proposerAccounts).not.toEqual(null)
    // expect(timelockData.cancellerAccounts).not.toEqual(null)
    // expect(timelockData.executorAccounts).not.toEqual(null)
    // expect(timelockData.timestamps).toEqual(null)
    // expect(await getIsAdmin(deployer.address)).toEqual(true)
    // expect(await getIsProposer(deployer.address)).toEqual(true)
    // expect(await getIsCanceller(deployer.address)).toEqual(true)
    // expect(await getIsExecutor(deployer.address)).toEqual(true)
  })

  it('successfully parsed AccessControll opcode', async () => {
    const body = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.proposer, account: other.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getRoleAdmin(rbactl.roles.proposer)).toEqual(rbactl.roles.admin)

    expect(await acContract.getHasRole(rbactl.roles.proposer, deployer.address)).toEqual(true)
    expect(await acContract.getHasRole(rbactl.roles.proposer, other.address)).toEqual(true)

    const member0Addr = await acContract.getRoleMember(rbactl.roles.proposer, 0n)
    expect(member0Addr).not.toBeNull()
    expect(member0Addr!.toString()).toEqual(deployer.address.toString()) // default admin role

    const member1Addr = await acContract.getRoleMember(rbactl.roles.proposer, 1n)
    expect(member1Addr).not.toBeNull()
    expect(member1Addr!.toString()).toEqual(other.address.toString()) // default admin role
  })

  it('successful update account - add admin account', async () => {
    const body = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.admin, account: other.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.admin, other.address)).toEqual(true)
  })

  it('successful update account - add proposer account', async () => {
    const body = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.proposer, account: other.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.proposer, other.address)).toEqual(true)
  })

  it('successful update account - add canceller account', async () => {
    const body = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.canceller, account: other.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.canceller, other.address)).toEqual(true)
  })

  it('successful update account - add executor account', async () => {
    const body = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.executor, account: other.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.executor, other.address)).toEqual(true)
  })

  it('successful update account - remove admin account', async () => {
    const bodyInit = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.admin, account: deployer.address })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.admin, deployer.address)).toEqual(true)

    const body = ac.builder.message
      .encode()
      .revokeRole({ queryId: 1n, role: rbactl.roles.admin, account: deployer.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.RevokeRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.admin, deployer.address)).toEqual(false)
  })

  it('successful update account - remove proposer account', async () => {
    const bodyInit = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.proposer, account: deployer.address })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.proposer, deployer.address)).toEqual(true)

    const body = ac.builder.message
      .encode()
      .revokeRole({ queryId: 1n, role: rbactl.roles.proposer, account: deployer.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.RevokeRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.proposer, deployer.address)).toEqual(false)
  })

  it('successful update account - remove canceller account', async () => {
    const bodyInit = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.canceller, account: deployer.address })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.canceller, deployer.address)).toEqual(true)

    const body = ac.builder.message
      .encode()
      .revokeRole({ queryId: 1n, role: rbactl.roles.canceller, account: deployer.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.RevokeRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.canceller, deployer.address)).toEqual(false)
  })

  it('successful update account - remove executor account', async () => {
    const bodyInit = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.executor, account: deployer.address })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.executor, deployer.address)).toEqual(true)

    const body = ac.builder.message
      .encode()
      .revokeRole({ queryId: 1n, role: rbactl.roles.executor, account: deployer.address })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.RevokeRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.executor, deployer.address)).toEqual(false)
  })

  it('invalid sender for update accounts: wrong_op', async () => {
    const bodyInit = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: rbactl.roles.admin, account: other.address })
    const result = await timelock.sendInternal(other.getSender(), toNano('0.05'), bodyInit)

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: timelock.address,
      success: false,
      op: ac.opcodes.in.GrantRole,
      exitCode: ac.errors.UnouthorizedAccount,
    })
  })

  it('successful update delay', async () => {
    const delay = 100

    const bodyInit = rbactl.builder.message.encode().updateDelay({ queryId: 1n, newDelay: delay })
    const result = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: rbactl.opcodes.in.UpdateDelay,
    })

    expect(await timelock.getMinDelay()).toEqual(100n)
  })

  it('invalid sender for update delay: wrong_op', async () => {
    const bodyInit = rbactl.builder.message.encode().updateDelay({ queryId: 1n, newDelay: 100 })
    const result = await timelock.sendInternal(other.getSender(), toNano('0.05'), bodyInit)

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: timelock.address,
      success: false,
      op: rbactl.opcodes.in.UpdateDelay,
      exitCode: ac.errors.UnouthorizedAccount,
    })
  })

  // it('successful schedule', async () => {
  //   const tonValue = toNano('0.1')
  //   const predecessor = 0n
  //   const salt = 0n
  //   const targetAccount = deployer.address
  //   const msgToSend = beginCell().endCell()
  //   const result = await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('1.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: true,
  //     op: Opcodes.schedule,
  //   })

  //   const offchainId = beginCell()
  //     .storeCoins(tonValue)
  //     .storeUint(predecessor, 256)
  //     .storeUint(salt, 256)
  //     .storeAddress(targetAccount)
  //     .storeRef(msgToSend)
  //     .endCell()
  //     .hash()
  //   const id = await getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   expect(id).toEqual(BigInt('0x' + offchainId.toString('hex')))
  //   expect(await timelock.getTimestamp(id)).toEqual(result.transactions[1].now + minDelay)
  //   expect(await timelock.getOperationState(id)).toEqual(roles.waiting_)
  //   const timelockData = await timelock.getRBACTimelockData()
  //   expect(timelockData.timestampCount).toEqual(1)
  //   expect(timelockData.timestamps).not.toEqual(null)
  //   expect(await timelock.getOperationState(1n)).toEqual(roles.unset_)

  //   scheduleSnapshot = blockchain.snapshot()
  //   scheduleId = id
  //   executeData = {
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   }
  // })

  // it('invalid delay for schedule', async () => {
  //   const result = await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay - 1,
  //     tonValue: toNano('0.1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.schedule,
  //     exitCode: Errors.invalid_delay,
  //   })
  // })

  // it('operation exists for schedule', async () => {
  //   await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: toNano('0.1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   const result = await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: toNano('0.1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.schedule,
  //     exitCode: Errors.operation_exists,
  //   })
  // })

  // it('invalid sender for schedule: wrong_op', async () => {
  //   const result = await timelock.sendSchedule(other.getSender(), {
  //     value: toNano('0.05'),
  //     delay: 100,
  //     tonValue: toNano('0.1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.schedule,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('successful cancel', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   const result = await timelock.sendCancel(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     id: scheduleId,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: true,
  //     op: Opcodes.cancel,
  //   })

  //   expect(await timelock.getTimestamp(scheduleId)).toEqual(0)
  //   expect(await timelock.getOperationState(scheduleId)).toEqual(roles.unset_)
  //   const timelockData = await timelock.getRBACTimelockData()
  //   expect(timelockData.timestampCount).toEqual(0)
  //   expect(timelockData.timestamps).toEqual(null)
  // })

  // it('operation not exists for cancel', async () => {
  //   const result = await timelock.sendCancel(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     id: 1n,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.cancel,
  //     exitCode: Errors.operation_not_exists,
  //   })
  // })

  // it('invalid operation state (already done) for cancel', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)
  //   blockchain.now = await timelock.getTimestamp(scheduleId)
  //   expect(await timelock.getOperationState(scheduleId)).toEqual(roles.ready_)

  // const body = rbactl.builder.message
  //   .encode()
  //   .topUp({ queryId: 1n})
  // const result = await timelock.sendInternal(deployer.getSender(), toNano('1'), body)

  //   await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   const result = await timelock.sendCancel(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     id: scheduleId,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.cancel,
  //     exitCode: Errors.invalid_operation_state,
  //   })
  // })

  // it('invalid sender for cancel: wrong_op', async () => {
  //   const result = await timelock.sendCancel(other.getSender(), {
  //     value: toNano('0.05'),
  //     id: 1n,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.cancel,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('successful execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   blockchain.now = await timelock.getTimestamp(scheduleId)
  //   expect(await timelock.getOperationState(scheduleId)).toEqual(roles.ready_)

  // const body = rbactl.builder.message
  //   .encode()
  //   .topUp({ queryId: 1n})
  // await timelock.sendInternal(deployer.getSender(), toNano('1'), body)

  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: true,
  //     op: Opcodes.execute,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: timelock.address,
  //     to: executeData.targetAccount,
  //   })

  //   expect(await timelock.getTimestamp(scheduleId)).toEqual(roles.done_time)
  //   expect(await timelock.getOperationState(scheduleId)).toEqual(roles.done_)
  // })

  // it('successful execute with predecessor', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   blockchain.now = await getTimestamp(scheduleId)

  // const body = rbactl.builder.message
  //   .encode()
  //   .topUp({ queryId: 1n})
  // await timelock.sendInternal(deployer.getSender(), toNano('1'), body)

  //   await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   const tonValue = 0n
  //   const predecessor = scheduleId
  //   const salt = 100n
  //   const targetAccount = deployer.address
  //   const msgToSend = beginCell().endCell()
  //   await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const id = await timelock.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   blockchain.now = await timelock.getTimestamp(id)

  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: true,
  //     op: Opcodes.execute,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: timelock.address,
  //     to: executeData.targetAccount,
  //   })

  //   expect(await timelock.getTimestamp(id)).toEqual(roles.done_time)
  //   expect(await timelock.getOperationState(id)).toEqual(roles.done_)
  // })

  // it('predecessor not exists for execute', async () => {
  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: 1000000n,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.predecessor_not_exists,
  //   })
  // })

  // it('invalid predecessor state for execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   const tonValue = 0n
  //   const predecessor = scheduleId
  //   const salt = 100n
  //   const targetAccount = deployer.address
  //   const msgToSend = beginCell().endCell()
  //   await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const id = await timelock.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   blockchain.now = await timelock.getTimestamp(id)

  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.invalid_predecessor_state,
  //   })
  // })

  // it('insufficient ton funds for execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   blockchain.now = await timelock.getTimestamp(scheduleId)
  //   expect(await timelock.getOperationState(scheduleId)).toEqual(roles.ready_)

  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: 0,
  //     actionResultCode: 37,
  //   })
  // })

  // it('invalid operation state for execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.invalid_operation_state,
  //   })
  // })

  // it('operation not exists for execute', async () => {
  //   const result = await timelock.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: toNano('1'),
  //     predecessor: 0n,
  //     salt: 1000000n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.operation_not_exists,
  //   })
  // })

  // it('invalid sender for execute: wrong_op', async () => {
  //   const result = await timelock.sendExecute(other.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: toNano('1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('successful clear timestamps', async () => {
  //   const tonValue = 0n
  //   const predecessor = scheduleId
  //   const salt1 = 100n
  //   const targetAccount = deployer.address
  //   const msgToSend = beginCell().endCell()
  //   await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt1,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const salt2 = 100n
  //   await timelock.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt2,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const id1 = await timelock.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt1,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   const id2 = await timelock.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt2,
  //     targetAccount,
  //     msgToSend,
  //   )

  //   const result = await timelock.sendClearTimestamps(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     ids: [id1, id2],
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelock.address,
  //     success: true,
  //     op: Opcodes.clear_timestamps,
  //   })

  //   expect(await timelock.getTimestamp(id1)).toEqual(roles.unset_)
  //   expect(await timelock.getTimestamp(id2)).toEqual(roles.unset_)
  //   const timelockData = await timelock.getRBACTimelockData()
  //   expect(timelockData.timestampCount).toEqual(0)
  //   expect(timelockData.timestamps).toEqual(null)
  // })

  // it('invalid sender for clear timestamps: wrong_op', async () => {
  //   const result = await timelock.sendClearTimestamps(other.getSender(), {
  //     value: toNano('0.05'),
  //     ids: [1n, 2n],
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelock.address,
  //     success: false,
  //     op: Opcodes.clear_timestamps,
  //     exitCode: Errors.wrong_op,
  //   })
  // })
})
