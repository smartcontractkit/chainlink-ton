import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, beginCell, toNano } from '@ton/core'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import {
  Errors,
  ExecuteData,
  Opcodes,
  Params,
  Builder,
  TimelockController,
  TimelockControllerStorage,
} from '../../../wrappers/mcms/timelock/TimelockController'

import * as ac from '../../../wrappers/lib/access/AccessControl'
import * as ace from '../../../wrappers/lib/access/extension/AccessControlEnumerable'

describe('TimelockController', () => {
  let code: Cell

  beforeAll(async () => {
    code = await compile('mcms.timelock.Timelock')
  })

  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let other: SandboxContract<TreasuryContract>

  // Contract bindings
  let acContract: SandboxContract<ac.AccessControl>
  let timelockController: SandboxContract<TimelockController>

  let minDelay: number
  let scheduleSnapshot: BlockchainSnapshot
  let scheduleId: bigint
  let executeData: ExecuteData

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    other = await blockchain.treasury('other')
    minDelay = 7

    const roleData: ac.ContractRoleData = {
      hasRole: ac.builder.data.encode().hasRoleDict([deployer.address]),
      adminRole: 0n, // default admin role
    }

    const rbacStorage: ace.ContractData = {
      underlying: {
        roles: ac.builder.data.encode().rolesDict(
          new Map([
            [Params.admin_role, roleData],
            [Params.proposer_role, roleData],
            [Params.canceller_role, roleData],
            [Params.executor_role, roleData],
          ]),
        ),
      },
      roleMembers: ace.builder.data.encode().roleMembersDict([deployer.address]),
    }

    const data = {
      minDelay: minDelay,
      rbac: ace.builder.data.encode().contractData(rbacStorage),
    }

    timelockController = blockchain.openContract(TimelockController.createFromConfig(data, code))
    acContract = blockchain.openContract(ac.AccessControl.newFrom(timelockController.address))
  })

  it('should deploy', async () => {
    const deployResult = await timelockController.sendTopUp(deployer.getSender(), {
      value: toNano('0.05'),
    })

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelockController.address,
      deploy: true,
      success: true,
      op: Opcodes.top_up,
    })

    expect(await acContract.getHasRole(Params.admin_role, deployer.address)).toEqual(true)

    // const timelockControllerData = await timelockController.getTimelockControllerData()
    // expect(timelockControllerData.minDelay).toEqual(minDelay)
    // expect(timelockControllerData.timestampCount).toEqual(0)
    // expect(timelockControllerData.adminAccounts).not.toEqual(null)
    // expect(timelockControllerData.proposerAccounts).not.toEqual(null)
    // expect(timelockControllerData.cancellerAccounts).not.toEqual(null)
    // expect(timelockControllerData.executorAccounts).not.toEqual(null)
    // expect(timelockControllerData.timestamps).toEqual(null)
    // expect(await timelockController.getIsAdmin(deployer.address)).toEqual(true)
    // expect(await timelockController.getIsProposer(deployer.address)).toEqual(true)
    // expect(await timelockController.getIsCanceller(deployer.address)).toEqual(true)
    // expect(await timelockController.getIsExecutor(deployer.address)).toEqual(true)
  })

  it('successfully parsed AccessControll opcode', async () => {
    const body = ac.builder.message
      .encode()
      .grantRole({ queryId: 1n, role: 1337n, account: other.address })
    const result = await timelockController.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelockController.address,
      success: true,
      op: ac.opcodes.GrantRole,
    })

    expect(await acContract.getHasRole(1337n, other.address)).toEqual(true)
  })

  // it('successful update account - add admin account', async () => {
  //   const result = await timelockController.sendAddAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.admin_role),
  //     account: other.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsAdmin(other.address)).toEqual(true)
  // })

  // it('successful update account - add proposer account', async () => {
  //   const result = await timelockController.sendAddAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.proposer_role),
  //     account: other.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsProposer(other.address)).toEqual(true)
  // })

  // it('successful update account - add canceller account', async () => {
  //   const result = await timelockController.sendAddAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.canceller_role),
  //     account: other.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsCanceller(other.address)).toEqual(true)
  // })

  // it('successful update account - add executor account', async () => {
  //   const result = await timelockController.sendAddAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.executor_role),
  //     account: other.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsExecutor(other.address)).toEqual(true)
  // })

  // it('successful update account - remove admin account', async () => {
  //   const result = await timelockController.sendRemoveAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.admin_role),
  //     account: deployer.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsAdmin(deployer.address)).toEqual(false)
  // })

  // it('successful update account - remove proposer account', async () => {
  //   const result = await timelockController.sendRemoveAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.proposer_role),
  //     account: deployer.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsProposer(deployer.address)).toEqual(false)
  // })

  // it('successful update account - remove canceller account', async () => {
  //   const result = await timelockController.sendRemoveAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.canceller_role),
  //     account: deployer.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsCanceller(deployer.address)).toEqual(false)
  // })

  // it('successful update account - remove executor account', async () => {
  //   const result = await timelockController.sendRemoveAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.executor_role),
  //     account: deployer.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_accounts,
  //   })

  //   expect(await timelockController.getIsExecutor(deployer.address)).toEqual(false)
  // })

  // it('invalid sender for update accounts: wrong_op', async () => {
  //   const result = await timelockController.sendAddAccount(other.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.admin_role),
  //     account: other.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.update_accounts,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('account exists error for update accounts', async () => {
  //   const result = await timelockController.sendAddAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.admin_role),
  //     account: deployer.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.update_accounts,
  //     exitCode: Errors.account_exists,
  //   })
  // })

  // it('account not exists error for update accounts', async () => {
  //   const result = await timelockController.sendRemoveAccount(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     role: Number(Params.admin_role),
  //     account: other.address,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.update_accounts,
  //     exitCode: Errors.account_not_exists,
  //   })
  // })

  // it('successful update delay', async () => {
  //   const delay = 100

  //   const result = await timelockController.sendUpdateDelay(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: delay,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.update_delay,
  //   })

  //   expect((await timelockController.getTimelockControllerData()).minDelay).toEqual(delay)
  // })

  // it('invalid sender for update delay: wrong_op', async () => {
  //   const result = await timelockController.sendUpdateDelay(other.getSender(), {
  //     value: toNano('0.05'),
  //     delay: 100,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.update_delay,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('successful schedule', async () => {
  //   const tonValue = toNano('0.1')
  //   const predecessor = 0n
  //   const salt = 0n
  //   const targetAccount = deployer.address
  //   const msgToSend = beginCell().endCell()
  //   const result = await timelockController.sendSchedule(deployer.getSender(), {
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
  //     to: timelockController.address,
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
  //   const id = await timelockController.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   expect(id).toEqual(BigInt('0x' + offchainId.toString('hex')))
  //   expect(await timelockController.getTimestamp(id)).toEqual(result.transactions[1].now + minDelay)
  //   expect(await timelockController.getOperationState(id)).toEqual(Params.waiting_state)
  //   const timelockControllerData = await timelockController.getTimelockControllerData()
  //   expect(timelockControllerData.timestampCount).toEqual(1)
  //   expect(timelockControllerData.timestamps).not.toEqual(null)
  //   expect(await timelockController.getOperationState(1n)).toEqual(Params.unset_state)

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
  //   const result = await timelockController.sendSchedule(deployer.getSender(), {
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
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.schedule,
  //     exitCode: Errors.invalid_delay,
  //   })
  // })

  // it('operation exists for schedule', async () => {
  //   await timelockController.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: toNano('0.1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   const result = await timelockController.sendSchedule(deployer.getSender(), {
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
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.schedule,
  //     exitCode: Errors.operation_exists,
  //   })
  // })

  // it('invalid sender for schedule: wrong_op', async () => {
  //   const result = await timelockController.sendSchedule(other.getSender(), {
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
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.schedule,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('successful cancel', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   const result = await timelockController.sendCancel(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     id: scheduleId,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.cancel,
  //   })

  //   expect(await timelockController.getTimestamp(scheduleId)).toEqual(0)
  //   expect(await timelockController.getOperationState(scheduleId)).toEqual(Params.unset_state)
  //   const timelockControllerData = await timelockController.getTimelockControllerData()
  //   expect(timelockControllerData.timestampCount).toEqual(0)
  //   expect(timelockControllerData.timestamps).toEqual(null)
  // })

  // it('operation not exists for cancel', async () => {
  //   const result = await timelockController.sendCancel(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     id: 1n,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.cancel,
  //     exitCode: Errors.operation_not_exists,
  //   })
  // })

  // it('invalid operation state (already done) for cancel', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)
  //   blockchain.now = await timelockController.getTimestamp(scheduleId)
  //   expect(await timelockController.getOperationState(scheduleId)).toEqual(Params.ready_state)

  //   await timelockController.sendTopUp(deployer.getSender(), {
  //     value: toNano('1'),
  //   })

  //   await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   const result = await timelockController.sendCancel(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     id: scheduleId,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.cancel,
  //     exitCode: Errors.invalid_operation_state,
  //   })
  // })

  // it('invalid sender for cancel: wrong_op', async () => {
  //   const result = await timelockController.sendCancel(other.getSender(), {
  //     value: toNano('0.05'),
  //     id: 1n,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.cancel,
  //     exitCode: Errors.wrong_op,
  //   })
  // })

  // it('successful execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   blockchain.now = await timelockController.getTimestamp(scheduleId)
  //   expect(await timelockController.getOperationState(scheduleId)).toEqual(Params.ready_state)

  //   await timelockController.sendTopUp(deployer.getSender(), {
  //     value: toNano('1'),
  //   })

  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.execute,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: timelockController.address,
  //     to: executeData.targetAccount,
  //   })

  //   expect(await timelockController.getTimestamp(scheduleId)).toEqual(Params.done_timestamp)
  //   expect(await timelockController.getOperationState(scheduleId)).toEqual(Params.done_state)
  // })

  // it('successful execute with predecessor', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   blockchain.now = await timelockController.getTimestamp(scheduleId)

  //   await timelockController.sendTopUp(deployer.getSender(), {
  //     value: toNano('1'),
  //   })

  //   await timelockController.sendExecute(deployer.getSender(), {
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
  //   await timelockController.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const id = await timelockController.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   blockchain.now = await timelockController.getTimestamp(id)

  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.execute,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: timelockController.address,
  //     to: executeData.targetAccount,
  //   })

  //   expect(await timelockController.getTimestamp(id)).toEqual(Params.done_timestamp)
  //   expect(await timelockController.getOperationState(id)).toEqual(Params.done_state)
  // })

  // it('predecessor not exists for execute', async () => {
  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: 1000000n,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
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
  //   await timelockController.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const id = await timelockController.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   blockchain.now = await timelockController.getTimestamp(id)

  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.invalid_predecessor_state,
  //   })
  // })

  // it('insufficient ton funds for execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   blockchain.now = await timelockController.getTimestamp(scheduleId)
  //   expect(await timelockController.getOperationState(scheduleId)).toEqual(Params.ready_state)

  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: 0,
  //     actionResultCode: 37,
  //   })
  // })

  // it('invalid operation state for execute', async () => {
  //   await blockchain.loadFrom(scheduleSnapshot)

  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: executeData.tonValue,
  //     predecessor: executeData.predecessor,
  //     salt: executeData.salt,
  //     targetAccount: executeData.targetAccount,
  //     msgToSend: executeData.msgToSend,
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.invalid_operation_state,
  //   })
  // })

  // it('operation not exists for execute', async () => {
  //   const result = await timelockController.sendExecute(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: toNano('1'),
  //     predecessor: 0n,
  //     salt: 1000000n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.execute,
  //     exitCode: Errors.operation_not_exists,
  //   })
  // })

  // it('invalid sender for execute: wrong_op', async () => {
  //   const result = await timelockController.sendExecute(other.getSender(), {
  //     value: toNano('0.05'),
  //     tonValue: toNano('1'),
  //     predecessor: 0n,
  //     salt: 0n,
  //     targetAccount: deployer.address,
  //     msgToSend: beginCell().endCell(),
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelockController.address,
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
  //   await timelockController.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt1,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const salt2 = 100n
  //   await timelockController.sendSchedule(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     delay: minDelay,
  //     tonValue: tonValue,
  //     predecessor: predecessor,
  //     salt: salt2,
  //     targetAccount: targetAccount,
  //     msgToSend: msgToSend,
  //   })

  //   const id1 = await timelockController.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt1,
  //     targetAccount,
  //     msgToSend,
  //   )
  //   const id2 = await timelockController.getHashOperation(
  //     tonValue,
  //     predecessor,
  //     salt2,
  //     targetAccount,
  //     msgToSend,
  //   )

  //   const result = await timelockController.sendClearTimestamps(deployer.getSender(), {
  //     value: toNano('0.05'),
  //     ids: [id1, id2],
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: deployer.address,
  //     to: timelockController.address,
  //     success: true,
  //     op: Opcodes.clear_timestamps,
  //   })

  //   expect(await timelockController.getTimestamp(id1)).toEqual(Params.unset_state)
  //   expect(await timelockController.getTimestamp(id2)).toEqual(Params.unset_state)
  //   const timelockControllerData = await timelockController.getTimelockControllerData()
  //   expect(timelockControllerData.timestampCount).toEqual(0)
  //   expect(timelockControllerData.timestamps).toEqual(null)
  // })

  // it('invalid sender for clear timestamps: wrong_op', async () => {
  //   const result = await timelockController.sendClearTimestamps(other.getSender(), {
  //     value: toNano('0.05'),
  //     ids: [1n, 2n],
  //   })

  //   expect(result.transactions).toHaveTransaction({
  //     from: other.address,
  //     to: timelockController.address,
  //     success: false,
  //     op: Opcodes.clear_timestamps,
  //     exitCode: Errors.wrong_op,
  //   })
  // })
})
