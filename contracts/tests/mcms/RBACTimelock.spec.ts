import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as ac from '../../wrappers/lib/access/AccessControl'
import { crc32 } from 'zlib'
import { asSnakeData } from '../../utils'

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

  let minDelay: bigint

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    other = await blockchain.treasury('other')
    minDelay = 7n

    const roleData: ac.RoleData = {
      adminRole: rbactl.roles.admin, // default admin role
      membersLen: 1n, // one member (deployer)
      hasRole: ac.builder.data.hasRoleDict([deployer.address]),
    }

    const rbacStorage: ac.ContractData = {
      roles: ac.builder.data.rolesDict(
        new Map([
          [rbactl.roles.admin, roleData],
          [rbactl.roles.proposer, roleData],
          [rbactl.roles.canceller, roleData],
          [rbactl.roles.executor, roleData],
          [rbactl.roles.bypasser, roleData],
        ]),
      ),
    }

    const data = {
      id: crc32('mcms.timelock.test-sandbox'), // unique ID for this instance
      minDelay: minDelay,
      rbac: ac.builder.data.contractData.encode(rbacStorage),
    }

    timelock = blockchain.openContract(rbactl.ContractClient.newFrom(data, code))
    acContract = blockchain.openContract(ac.ContractClient.newAt(timelock.address))
  })

  it('Should compute crc32 opcodes', async () => {
    // In opcodes
    expect(rbactl.opcodes.in.Init).toBe(0x4982fcfd)
    expect(rbactl.opcodes.in.TopUp).toBe(0xfee62ba6)
    expect(rbactl.opcodes.in.ScheduleBatch).toBe(0x094718f4)
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
    const body = rbactl.builder.message.topUp.encode({ queryId: 1n })
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
    expect(memberAddr!).toEqualAddress(deployer.address) // default admin role

    // Inspect the initial state
    expect(await timelock.getMinDelay()).toEqual(minDelay)
    expect(await acContract.getRoleAdmin(rbactl.roles.proposer)).toEqual(rbactl.roles.admin) // default admin role
    expect(await acContract.getRoleAdmin(rbactl.roles.canceller)).toEqual(rbactl.roles.admin) // default admin role
    expect(await acContract.getRoleAdmin(rbactl.roles.executor)).toEqual(rbactl.roles.admin) // default admin role
    expect(await acContract.getRoleAdmin(rbactl.roles.bypasser)).toEqual(rbactl.roles.admin) // default admin role

    expect(await acContract.getHasRole(rbactl.roles.admin, deployer.address)).toEqual(true)
    expect(await acContract.getHasRole(rbactl.roles.proposer, deployer.address)).toEqual(true)
    expect(await acContract.getHasRole(rbactl.roles.canceller, deployer.address)).toEqual(true)
    expect(await acContract.getHasRole(rbactl.roles.executor, deployer.address)).toEqual(true)
    expect(await acContract.getHasRole(rbactl.roles.bypasser, deployer.address)).toEqual(true)
  })

  it('successfully parsed AccessControll opcode', async () => {
    const body = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.proposer,
      account: other.address,
    })
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
    expect(member0Addr!).toEqualAddress(deployer.address) // default admin role

    const member1Addr = await acContract.getRoleMember(rbactl.roles.proposer, 1n)
    expect(member1Addr).not.toBeNull()
    expect(member1Addr!).toEqualAddress(other.address) // default admin role
  })

  it('successful update account - add admin account', async () => {
    const body = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.admin,
      account: other.address,
    })
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
    const body = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.proposer,
      account: other.address,
    })
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
    const body = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.canceller,
      account: other.address,
    })
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
    const body = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.executor,
      account: other.address,
    })
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
    const bodyInit = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.admin,
      account: deployer.address,
    })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.admin, deployer.address)).toEqual(true)

    const body = ac.builder.message.revokeRole.encode({
      queryId: 1n,
      role: rbactl.roles.admin,
      account: deployer.address,
    })
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
    const bodyInit = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.proposer,
      account: deployer.address,
    })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.proposer, deployer.address)).toEqual(true)

    const body = ac.builder.message.revokeRole.encode({
      queryId: 1n,
      role: rbactl.roles.proposer,
      account: deployer.address,
    })
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
    const bodyInit = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.canceller,
      account: deployer.address,
    })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.canceller, deployer.address)).toEqual(true)

    const body = ac.builder.message.revokeRole.encode({
      queryId: 1n,
      role: rbactl.roles.canceller,
      account: deployer.address,
    })
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
    const bodyInit = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.executor,
      account: deployer.address,
    })
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.executor, deployer.address)).toEqual(true)

    const body = ac.builder.message.revokeRole.encode({
      queryId: 1n,
      role: rbactl.roles.executor,
      account: deployer.address,
    })
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
    const bodyInit = ac.builder.message.grantRole.encode({
      queryId: 1n,
      role: rbactl.roles.admin,
      account: other.address,
    })
    const result = await timelock.sendInternal(other.getSender(), toNano('0.05'), bodyInit)

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: timelock.address,
      success: false,
      op: ac.opcodes.in.GrantRole,
      exitCode: ac.Errors.UnauthorizedAccount,
    })
  })

  it('successful update delay', async () => {
    const delay = 100

    const bodyInit = rbactl.builder.message.updateDelay.encode({ queryId: 1n, newDelay: delay })
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
    const bodyInit = rbactl.builder.message.updateDelay.encode({ queryId: 1n, newDelay: 100 })
    const result = await timelock.sendInternal(other.getSender(), toNano('0.05'), bodyInit)

    expect(result.transactions).toHaveTransaction({
      from: other.address,
      to: timelock.address,
      success: false,
      op: rbactl.opcodes.in.UpdateDelay,
      exitCode: ac.Errors.UnauthorizedAccount,
    })
  })

  it('successful schedule', async () => {
    const tonValue = toNano('0.1')
    const predecessor = 0n
    const salt = 0n
    const targetAccount = deployer.address
    const msgToSend = beginCell().endCell()

    const calls = [
      {
        target: targetAccount,
        value: tonValue,
        data: msgToSend,
      },
    ]
    const op = {
      calls: asSnakeData<rbactl.Call>(calls, (c) => rbactl.builder.data.call.encode(c).asBuilder()),
      predecessor: predecessor,
      salt: salt,
    }

    const result = await timelock.sendScheduleBatch(deployer.getSender(), toNano('1.05'), {
      queryId: 1n,
      calls: op.calls,
      predecessor: op.predecessor,
      salt: op.salt,
      delay: minDelay,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: rbactl.opcodes.in.ScheduleBatch,
    })

    const offchainId = rbactl.builder.data.operationBatch.encode(op).hash()

    // Verify off-chain and on-chain ID equivalence
    const id = await timelock.getHashOperationBatch(op)
    expect(id).toEqual(BigInt('0x' + offchainId.toString('hex')))

    expect(await timelock.getTimestamp(id)).toEqual(
      BigInt(result.transactions[1].now + Number(minDelay)),
    )
    expect(await timelock.isOperationDone(id)).toEqual(false)
    expect(await timelock.isOperationReady(1n)).toEqual(false)
  })
})
