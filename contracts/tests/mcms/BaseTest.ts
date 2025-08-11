import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, Dictionary, toNano, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'

import { asSnakeData } from '../../utils'

import * as mcms from '../../wrappers/mcms/MCMS'
import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as callproxy from '../../wrappers/mcms/CallProxy'
import * as ac from '../../wrappers/lib/access/AccessControl'
import * as counter from '../../wrappers/examples/Counter'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

import { crc32 } from 'zlib'

export interface TestCode {
  mcms: Cell
  timelock: Cell
  callProxy: Cell
  counter: Cell
}

export interface TestAccounts {
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

export interface TestContracts {
  timelock: SandboxContract<rbactl.ContractClient>
  ac: SandboxContract<ac.ContractClient>
  callProxy: SandboxContract<callproxy.ContractClient>
  counter: SandboxContract<counter.ContractClient>
}

export class BaseTestSetup {
  static readonly MIN_DELAY = 24n * 60n * 60n * 7n
  static readonly DONE_TIMESTAMP = 1n
  static readonly NO_PREDECESSOR = 0n
  static readonly EMPTY_SALT = 0n

  blockchain: Blockchain
  code: TestCode
  acc: TestAccounts
  bind: TestContracts

  constructor() {
    this.blockchain = null as any
    this.code = null as any
    this.acc = null as any
    this.bind = null as any
  }

  static async compileContracts(): Promise<TestCode> {
    return {
      mcms: await compile('mcms.MCMS'),
      timelock: await compile('mcms.RBACTimelock'),
      callProxy: await compile('mcms.CallProxy'),
      counter: await compile('examples.Counter'),
    }
  }

  /**
   * Helper function that turns a single RBACTimelock.Call into a vector of calls.
   */
  static singletonCalls(call: rbactl.Call): Cell {
    const calls = [call]
    return asSnakeData<rbactl.Call>(calls, (c) => rbactl.builder.data.call.encode(c).asBuilder())
  }

  /**
   * Create a call with a specific selector
   */
  encodeCallWithSelector(selector: number): Cell {
    return beginCell().storeUint(selector, 32).endCell()
  }

  /**
   * Initialize the blockchain and setup accounts
   */
  async initializeBlockchain(): Promise<void> {
    this.blockchain = await Blockchain.create()
    this.blockchain.now = 1
    this.blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }

    // Set up accounts
    this.acc = {
      deployer: await this.blockchain.treasury('deployer'),
      admin: await this.blockchain.treasury('admin'),
      proposerOne: await this.blockchain.treasury('proposerOne'),
      proposerTwo: await this.blockchain.treasury('proposerTwo'),
      executorOne: await this.blockchain.treasury('executorOne'),
      executorTwo: await this.blockchain.treasury('executorTwo'),
      cancellerOne: await this.blockchain.treasury('cancellerOne'),
      cancellerTwo: await this.blockchain.treasury('cancellerTwo'),
      bypasserOne: await this.blockchain.treasury('bypasserOne'),
      bypasserTwo: await this.blockchain.treasury('bypasserTwo'),
    }

    this.bind = {
      timelock: null as any,
      ac: null as any,
      callProxy: null as any,
      counter: null as any,
    }
  }

  /**
   * Setup the timelock contract with RBAC configuration
   */
  async setupTimelockContract(testId: string): Promise<void> {
    const PROPOSERS = [this.acc.proposerOne.address, this.acc.proposerTwo.address]
    const EXECUTORS = [this.acc.executorOne.address, this.acc.executorTwo.address]
    const CANCELLERS = [this.acc.cancellerOne.address, this.acc.cancellerTwo.address]
    const BYPASSERS = [this.acc.bypasserOne.address, this.acc.bypasserTwo.address]

    const rbacStorage: ac.ContractData = {
      roles: ac.builder.data.rolesDict(
        new Map([
          [
            rbactl.roles.admin,
            {
              adminRole: rbactl.roles.admin,
              membersLen: 1n,
              hasRole: ac.builder.data.hasRoleDict([this.acc.admin.address]),
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
      id: crc32(`mcms.timelock.${testId}`),
      minDelay: BaseTestSetup.MIN_DELAY,
      rbac: ac.builder.data.contractData.encode(rbacStorage),
    }

    this.bind.timelock = this.blockchain.openContract(
      rbactl.ContractClient.newFrom(data, this.code.timelock),
    )
    this.bind.ac = this.blockchain.openContract(ac.ContractClient.newAt(this.bind.timelock.address))
  }

  /**
   * Setup the call proxy contract
   */
  async setupCallProxyContract(testId: string): Promise<void> {
    const data = {
      id: crc32(`mcms.call-proxy.${testId}`),
      target: this.bind.timelock.address,
    }
    this.bind.callProxy = this.blockchain.openContract(
      callproxy.ContractClient.newFrom(data, this.code.callProxy),
    )
  }

  /**
   * Setup the counter contract
   */
  async setupCounterContract(testId: string): Promise<void> {
    const data = {
      id: crc32(`mcms.counter.${testId}`),
      value: 0,
      ownable: {
        owner: this.bind.timelock.address,
        pendingOwner: null,
      },
    }
    this.bind.counter = this.blockchain.openContract(
      counter.ContractClient.newFrom(data, this.code.counter),
    )
  }

  /**
   * Deploy the timelock contract and verify deployment
   */
  async deployTimelockContract(): Promise<void> {
    const body = rbactl.builder.message.topUp.encode({ queryId: 1n })
    const result = await this.bind.timelock.sendInternal(
      this.acc.deployer.getSender(),
      toNano('0.05'),
      body,
    )

    expect(result.transactions).toHaveTransaction({
      from: this.acc.deployer.address,
      to: this.bind.timelock.address,
      deploy: true,
      success: true,
    })

    expect(await this.bind.ac.getHasRole(rbactl.roles.admin, this.acc.admin.address)).toEqual(true)
    expect(await this.bind.ac.getRoleAdmin(rbactl.roles.admin)).toEqual(rbactl.roles.admin)
  }

  // TODO
  // deployCallProxyContract() {
  //   const body = callproxy.builder.message.topUp.encode({ queryId: 1n })
  //   return this.bind.callProxy.sendInternal(this.acc.deployer.getSender(), toNano('0.05'), body)
  // }

  deployCounterContract() {
    // const body = counter.builder.message.topUp.encode({ queryId: 1n }) // TODO use TopUp after it is implemented
    const body = beginCell().endCell()
    return this.bind.counter.sendInternal(this.acc.deployer.getSender(), toNano('0.05'), body)
  }

  /**
   * Complete setup for all contracts - convenience method that combines all setup steps
   */
  async setupAll(testId: string): Promise<void> {
    await this.initializeBlockchain()
    await this.setupTimelockContract(testId)
    await this.deployTimelockContract()
    await this.setupCallProxyContract(testId)
    // await this.deployCallProxyContract()
    await this.setupCounterContract(testId)
    await this.deployCounterContract()
  }

  /**
   * Move time forward by a specific period (in seconds)
   */
  warpTime(period: number) {
    this.blockchain.now = this.blockchain.now!! + period
  }
}
