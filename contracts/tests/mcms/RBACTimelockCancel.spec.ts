import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, Dictionary, toNano, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'

import * as mcms from '../../wrappers/mcms/MCMS'
import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as callproxy from '../../wrappers/mcms/CallProxy'
import * as ac from '../../wrappers/lib/access/AccessControl'
import * as counter from '../../wrappers/examples/Counter'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

import { crc32 } from 'zlib'

describe('MCMS - RBACTimelockCancelTest', () => {
  let blockchain: Blockchain

  var code: {
    mcms: Cell
    timelock: Cell
    callProxy: Cell
    counter: Cell
  }

  beforeAll(async () => {
    code = {
      mcms: await compile('mcms.MCMS'),
      timelock: await compile('mcms.RBACTimelock'),
      callProxy: await compile('mcms.CallProxy'),
      counter: await compile('examples.Counter'),
    }
  })

  var acc: {
    deployer: SandboxContract<TreasuryContract>
    admin: SandboxContract<TreasuryContract>
    proposerOne: SandboxContract<TreasuryContract>
    proposerTwo: SandboxContract<TreasuryContract>
    executorOne: SandboxContract<TreasuryContract>
    executorTwo: SandboxContract<TreasuryContract>
    cancellerOne: SandboxContract<TreasuryContract>
    cancellerTwo: SandboxContract<TreasuryContract>
    bypasserOne: SandboxContract<TreasuryContract>
    bypasserTwo: SandboxContract<TreasuryContract>
  }

  var bind: {
    timelock: SandboxContract<rbactl.ContractClient>
    ac: SandboxContract<ac.ContractClient>
    callProxy: SandboxContract<callproxy.ContractClient>
    counter: SandboxContract<counter.ContractClient>
  }

  const MIN_DELAY = 24 * 60 * 60 * 7
  const DONE_TIMESTAMP = 1

  const NO_PREDECESSOR = 0n
  const EMPTY_SALT = 0n

  function singletonCalls(call: rbactl.Call): Cell {
    return rbactl.builder.data.call.encode(call)
  }

  function createIncrementCall(): rbactl.Call {
    return {
      target: bind.counter.address,
      value: 0n,
      data: counter.builder.message.increaseCount.encode({ queryId: 1n }),
    }
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = 1
    // Verbosity = 'none' | 'vm_logs' | 'vm_logs_location' | 'vm_logs_gas' | 'vm_logs_full' | 'vm_logs_verbose';
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }

    // Set up accounts
    acc = {
      deployer: await blockchain.treasury('deployer'),
      admin: await blockchain.treasury('admin'),
      proposerOne: await blockchain.treasury('proposerOne'),
      proposerTwo: await blockchain.treasury('proposerTwo'),
      executorOne: await blockchain.treasury('executorOne'),
      executorTwo: await blockchain.treasury('executorTwo'),
      cancellerOne: await blockchain.treasury('cancellerOne'),
      cancellerTwo: await blockchain.treasury('cancellerTwo'),
      bypasserOne: await blockchain.treasury('bypasserOne'),
      bypasserTwo: await blockchain.treasury('bypasserTwo'),
    }

    bind = {
      timelock: null as any,
      ac: null as any,
      callProxy: null as any,
      counter: null as any,
    }

    // Set up Timelock contract
    {
      const PROPOSERS = [acc.proposerOne.address, acc.proposerTwo.address]
      const EXECUTORS = [acc.executorOne.address, acc.executorTwo.address]
      const CANCELLERS = [acc.cancellerOne.address, acc.cancellerTwo.address]
      const BYPASSERS = [acc.bypasserOne.address, acc.bypasserTwo.address]

      const rbacStorage: ac.ContractData = {
        roles: ac.builder.data.rolesDict(
          new Map([
            [
              rbactl.roles.admin,
              {
                adminRole: rbactl.roles.admin,
                membersLen: 1n,
                hasRole: ac.builder.data.hasRoleDict([acc.admin.address]),
              },
            ],
            [
              rbactl.roles.proposer,
              {
                adminRole: rbactl.roles.admin,
                membersLen: BigInt(PROPOSERS.length),
                hasRole: ac.builder.data.hasRoleDict(PROPOSERS),
              },
            ],
            [
              rbactl.roles.executor,
              {
                adminRole: rbactl.roles.admin,
                membersLen: BigInt(EXECUTORS.length),
                hasRole: ac.builder.data.hasRoleDict(EXECUTORS),
              },
            ],
            [
              rbactl.roles.canceller,
              {
                adminRole: rbactl.roles.admin,
                membersLen: BigInt(CANCELLERS.length),
                hasRole: ac.builder.data.hasRoleDict(CANCELLERS),
              },
            ],
            [
              rbactl.roles.bypasser,
              {
                adminRole: rbactl.roles.admin,
                membersLen: BigInt(BYPASSERS.length),
                hasRole: ac.builder.data.hasRoleDict(BYPASSERS),
              },
            ],
          ]),
        ),
      }

      const data = {
        id: crc32('mcms.timelock.test-cancel'),
        minDelay: MIN_DELAY,
        rbac: ac.builder.data.contractData.encode(rbacStorage),
      }

      bind.timelock = blockchain.openContract(rbactl.ContractClient.newFrom(data, code.timelock))
      bind.ac = blockchain.openContract(ac.ContractClient.newAt(bind.timelock.address))
    }

    // Set up CallProxy contract
    {
      const data = {
        id: crc32('mcms.call-proxy.test-integration'), // unique ID for this instance
        target: bind.timelock.address,
      }
      bind.callProxy = blockchain.openContract(
        callproxy.ContractClient.newFrom(data, code.callProxy),
      )
    }

    // Set up Counter contract
    {
      const data = {
        id: crc32('mcms.counter.test-integration'), // unique ID for this instance
        value: 0,
        ownable: {
          owner: bind.timelock.address,
          pendingOwner: null, // no pending owner
        },
      }
      bind.counter = blockchain.openContract(counter.ContractClient.newFrom(data, code.counter))
    }

    // Deploy Timelock contract
    {
      const body = rbactl.builder.message.topUp.encode({ queryId: 1n })
      const result = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        deploy: true,
        success: true,
      })

      expect(await bind.ac.getHasRole(rbactl.roles.admin, acc.admin.address)).toEqual(true)
      expect(await bind.ac.getRoleAdmin(rbactl.roles.admin)).toEqual(rbactl.roles.admin) // default admin role
    }
  })

  it('should fail if non-canceller tries to cancel', async () => {
    // Try to cancel with executor role (should fail)
    const body = rbactl.builder.message.cancel.encode({
      queryId: 1n,
      id: EMPTY_SALT,
    })

    const result = await bind.timelock.sendInternal(
      acc.executorOne.getSender(),
      toNano('0.05'),
      body,
    )

    expect(result.transactions).toHaveTransaction({
      from: acc.executorOne.address,
      to: bind.timelock.address,
      success: false,
    })
  })

  it('should not be able to cancel finished operation', async () => {
    const call = createIncrementCall()
    const calls = singletonCalls(call)

    // Schedule operation
    {
      const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
        queryId: 1n,
        calls,
        predecessor: NO_PREDECESSOR,
        salt: EMPTY_SALT,
        delay: MIN_DELAY,
      })

      const result = await bind.timelock.sendInternal(
        acc.proposerOne.getSender(),
        toNano('0.05'),
        scheduleBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.proposerOne.address,
        to: bind.timelock.address,
        success: true,
      })
    }

    // Wait for delay
    blockchain.now = blockchain.now!! + MIN_DELAY + 1

    // Execute operation
    {
      const executeBody = rbactl.builder.message.executeBatch.encode({
        queryId: 1n,
        calls,
        predecessor: NO_PREDECESSOR,
        salt: EMPTY_SALT,
      })

      const result = await bind.timelock.sendInternal(
        acc.executorOne.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.executorOne.address,
        to: bind.timelock.address,
        success: true,
      })
    }

    // Get operation ID
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: NO_PREDECESSOR,
      salt: EMPTY_SALT,
    }
    const operationID = await bind.timelock.getHashOperationBatch(operationBatch)

    // Try to cancel finished operation (should fail)
    {
      const cancelBody = rbactl.builder.message.cancel.encode({
        queryId: 1n,
        id: operationID,
      })

      const result = await bind.timelock.sendInternal(
        acc.cancellerOne.getSender(),
        toNano('0.05'),
        cancelBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.cancellerOne.address,
        to: bind.timelock.address,
        success: false,
      })
    }
  })

  it('should allow canceller to cancel operation', async () => {
    await cancelOperation(acc.cancellerOne.address)
  })

  it('should allow admin to cancel operation', async () => {
    await cancelOperation(acc.admin.address)
  })

  async function cancelOperation(canceller: Address) {
    const call = createIncrementCall()
    const calls = singletonCalls(call)

    // Schedule operation
    const scheduleBody = rbactl.builder.message.scheduleBatch.encode({
      queryId: 1n,
      calls,
      predecessor: NO_PREDECESSOR,
      salt: EMPTY_SALT,
      delay: MIN_DELAY,
    })

    const scheduleResult = await bind.timelock.sendInternal(
      acc.proposerOne.getSender(),
      toNano('0.05'),
      scheduleBody,
    )

    // Verify schedule was successful
    expect(scheduleResult.transactions).toHaveTransaction({
      from: acc.proposerOne.address,
      to: bind.timelock.address,
      success: true,
    })

    // Get operation ID - use offline calculation since getHashOperationBatch has issues
    const operationBatch: rbactl.OperationBatch = {
      calls,
      predecessor: NO_PREDECESSOR,
      salt: EMPTY_SALT,
    }
    const offchainId = rbactl.builder.data.operationBatch.encode(operationBatch).hash()
    const operationID = BigInt('0x' + offchainId.toString('hex'))

    // Verify operation exists
    expect(await bind.timelock.isOperation(operationID)).toBe(true)

    // Cancel operation
    const cancelBody = rbactl.builder.message.cancel.encode({
      queryId: 1n,
      id: operationID,
    })

    const cancellerAccount = Object.values(acc).find((account) => account.address.equals(canceller))
    if (!cancellerAccount) {
      throw new Error(`Account with address ${canceller} not found`)
    }

    const result = await bind.timelock.sendInternal(
      cancellerAccount.getSender(),
      toNano('0.05'),
      cancelBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: canceller,
      to: bind.timelock.address,
      success: true,
    })

    // Verify operation no longer exists
    expect(await bind.timelock.isOperation(operationID)).toBe(false)
  }
})
