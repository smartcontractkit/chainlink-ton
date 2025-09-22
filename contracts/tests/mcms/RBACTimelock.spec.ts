import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import { rbactl } from '../../wrappers/mcms'
import { ac } from '../../wrappers/lib/access'
import { crc32 } from 'zlib'
import { asSnakeData } from '../../src/utils'

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
      membersLen: 0n, // no members yet
      hasRole: ac.builder.data.hasRoleDict([]),
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
      minDelay,
      executorRoleCheckEnabled: true,
      rbac: ac.builder.data.contractData.encode(rbacStorage).asCell(),
    }

    timelock = blockchain.openContract(rbactl.ContractClient.newFrom(data, code))
    acContract = blockchain.openContract(ac.ContractClient.newAt(timelock.address))
  })

  it('Should compute keccak256 roles', async () => {
    expect(rbactl.roles.admin).toBe(
      0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775n,
    )
    expect(rbactl.roles.proposer).toBe(
      0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1n,
    )
    expect(rbactl.roles.canceller).toBe(
      0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783n,
    )
    expect(rbactl.roles.executor).toBe(
      0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63n,
    )
    expect(rbactl.roles.bypasser).toBe(
      0xa1b2b8005de234c4b8ce8cd0be058239056e0d54f6097825b5117101469d5a8dn,
    )
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
    expect(rbactl.opcodes.in.UpdateExecutorRoleCheck).toBe(0x34d98baa)

    // Out opcodes
    expect(rbactl.opcodes.out.BatchScheduled).toBe(0xdf65b59e)
    expect(rbactl.opcodes.out.CallScheduled).toBe(0xc55fca54)
    expect(rbactl.opcodes.out.BatchExecuted).toBe(0xa941ea1a)
    expect(rbactl.opcodes.out.CallExecuted).toBe(0x49ea5d0e)
    expect(rbactl.opcodes.out.BypasserBatchExecuted).toBe(0x539b4214)
    expect(rbactl.opcodes.out.BypasserCallExecuted).toBe(0x9c7f3010)
    expect(rbactl.opcodes.out.Canceled).toBe(0x580e80f2)
    expect(rbactl.opcodes.out.MinDelayChange).toBe(0x904b14e0)
    expect(rbactl.opcodes.out.FunctionSelectorBlocked).toBe(0x9c4d6d94)
    expect(rbactl.opcodes.out.FunctionSelectorUnblocked).toBe(0xf410a31b)
    expect(rbactl.opcodes.out.ExecutorRoleCheckUpdated).toBe(0xc6d451e2)
  })

  it('should deploy', async () => {
    await deployInitTimelock()

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

  const deployInitTimelock = async () => {
    const body = rbactl.builder.message.in.init
      .encode({
        queryId: 1n,
        minDelay: minDelay,
        admin: deployer.address,
        proposers: [deployer.address],
        executors: [deployer.address],
        cancellers: [deployer.address],
        bypassers: [deployer.address],
        executorRoleCheckEnabled: true,
      })
      .asCell()

    const r = await timelock.sendInternal(deployer.getSender(), toNano('0.3'), body)

    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      deploy: true,
      success: true,
      op: rbactl.opcodes.in.Init,
    })
  }

  it('successfully parsed AccessControll opcode', async () => {
    await deployInitTimelock()

    const body = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.proposer,
        account: other.address,
      })
      .asCell()
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
    await deployInitTimelock()

    const body = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.admin,
        account: other.address,
      })
      .asCell()
    const r = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.admin, other.address)).toEqual(true)
  })

  it('successful update account - add proposer account', async () => {
    await deployInitTimelock()

    const body = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.proposer,
        account: other.address,
      })
      .asCell()
    const r = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.proposer, other.address)).toEqual(true)
  })

  it('successful update account - add canceller account', async () => {
    await deployInitTimelock()

    const body = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.canceller,
        account: other.address,
      })
      .asCell()
    const r = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.canceller, other.address)).toEqual(true)
  })

  it('successful update account - add executor account', async () => {
    await deployInitTimelock()

    const body = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.executor,
        account: other.address,
      })
      .asCell()
    const r = await timelock.sendInternal(deployer.getSender(), toNano('0.05'), body)

    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: timelock.address,
      success: true,
      op: ac.opcodes.in.GrantRole,
    })

    expect(await acContract.getHasRole(rbactl.roles.executor, other.address)).toEqual(true)
  })

  it('successful update account - remove admin account', async () => {
    await deployInitTimelock()

    const bodyInit = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.admin,
        account: deployer.address,
      })
      .asCell()
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.admin, deployer.address)).toEqual(true)

    const body = ac.builder.message.in.revokeRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.admin,
        account: deployer.address,
      })
      .asCell()
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
    await deployInitTimelock()

    const bodyInit = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.proposer,
        account: deployer.address,
      })
      .asCell()
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.proposer, deployer.address)).toEqual(true)

    const body = ac.builder.message.in.revokeRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.proposer,
        account: deployer.address,
      })
      .asCell()
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
    await deployInitTimelock()

    const bodyInit = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.canceller,
        account: deployer.address,
      })
      .asCell()
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.canceller, deployer.address)).toEqual(true)

    const body = ac.builder.message.in.revokeRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.canceller,
        account: deployer.address,
      })
      .asCell()
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
    await deployInitTimelock()

    const bodyInit = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.executor,
        account: deployer.address,
      })
      .asCell()
    await timelock.sendInternal(deployer.getSender(), toNano('0.05'), bodyInit)
    expect(await acContract.getHasRole(rbactl.roles.executor, deployer.address)).toEqual(true)

    const body = ac.builder.message.in.revokeRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.executor,
        account: deployer.address,
      })
      .asCell()
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
    await deployInitTimelock()

    const bodyInit = ac.builder.message.in.grantRole
      .encode({
        queryId: 1n,
        role: rbactl.roles.admin,
        account: other.address,
      })
      .asCell()
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
    await deployInitTimelock()

    const delay = 100

    const bodyInit = rbactl.builder.message.in.updateDelay
      .encode({ queryId: 1n, newDelay: delay })
      .asCell()
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
    await deployInitTimelock()

    const bodyInit = rbactl.builder.message.in.updateDelay
      .encode({ queryId: 1n, newDelay: 100 })
      .asCell()
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
    await deployInitTimelock()

    const tonValue = toNano('0.1')
    const predecessor = 0n
    const salt = 0n
    const targetAccount = deployer.address
    const msgToSend = Cell.EMPTY

    const calls = [
      {
        target: targetAccount,
        value: tonValue,
        data: msgToSend,
      },
    ]
    const op = {
      calls: asSnakeData<rbactl.Call>(calls, (c) => rbactl.builder.data.call.encode(c)),
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

    const offchainId = rbactl.builder.data.operationBatch.encode(op).asCell().hash()

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
