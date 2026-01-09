import '@ton/test-utils'
import {
  Blockchain,
  loadConfig,
  SandboxContract,
  SmartContract,
  TreasuryContract,
  updateConfig,
} from '@ton/sandbox'
import { beginCell, Cell, StateInit, StorageUsed, toNano } from '@ton/core'

import * as freezer from '../wrappers/examples/funding/Freezer'
import {
  GasLimitsPrices,
  GasLimitsPrices_gas_flat_pfx,
  GasLimitsPrices_gas_prices,
  GasLimitsPrices_gas_prices_ext,
} from '@ton/sandbox/dist/config/config.tlb-gen'
import { generateRandomContractId } from '../src/utils'

class CompleteStateInit {
  constructor(
    public code: Cell,
    public data: Cell,
  ) {}

  static fromStateInit(stateInit: StateInit): CompleteStateInit {
    if (!(stateInit.code && stateInit.data)) {
      throw new Error('StateInit is missing code or data')
    }
    return new CompleteStateInit(stateInit.code, stateInit.data)
  }
}

describe('Contract freezing and unfreezing', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let bind: {
    freezer: SandboxContract<freezer.ContractClient>
  }
  let code: Cell

  const dueLimits = {
    freeze_due_limit: 1_000n,
    delete_due_limit: 100_000n,
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = 1
    updateDueLimits(blockchain, dueLimits)

    deployer = await blockchain.treasury('deployer')
    code = await freezer.ContractClient.code()

    bind = {
      freezer: blockchain.openContract(
        freezer.ContractClient.createFromConfig(
          {
            id: generateRandomContractId(),
            value: 0,
          },
          code,
        ),
      ),
    }
  })

  it('should freeze and unfreeze', async () => {
    // Deploy
    const stateInit = await (async (): Promise<CompleteStateInit> => {
      const result = await bind.freezer.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: bind.freezer.address,
        deploy: true,
        success: true,
      })
      console.log('Deployed')
      const state = await getContractState()
      logAccountState(state)
      if (state.account.account!.storage.state.type !== 'active') {
        throw new Error('Contract is not active after deploy!')
      }
      return CompleteStateInit.fromStateInit(state.account.account!.storage.state.state)
    })()

    // Change Status
    const { lastBalance, currentState } = await (async (): Promise<{
      lastBalance: bigint
      currentState: CompleteStateInit
    }> => {
      const result = await bind.freezer.sendSetValue(deployer.getSender(), {
        value: toNano('0.05'),
        body: {
          queryID: 0n,
          value: 42,
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: bind.freezer.address,
        success: true,
      })
      console.log('Changed state')
      const state = await getContractState()
      logAccountState(state)
      if (state.account.account!.storage.state.type !== 'active') {
        throw new Error('Contract is not active after state change!')
      }
      return {
        lastBalance: state.balance,
        currentState: CompleteStateInit.fromStateInit(state.account.account!.storage.state.state),
      }
    })()

    // Freeze
    {
      console.log('Freezing')

      // Drain remaining balance to 0
      {
        const result = await bind.freezer.sendDrain(deployer.getSender(), toNano('0.05'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: bind.freezer.address,
          success: true,
        })
        expect(result.transactions).toHaveTransaction({
          from: bind.freezer.address,
          to: deployer.address,
          success: true,
          value(x) {
            console.log(`Drained value: ${x} nanotons`)
            return true
          },
        })

        const state = await getContractState()
        logAccountState(state)
        expect(state.balance).toBe(0n)
        expect(state.account.account!.storageStats.duePayment).toBeNull()
      }

      // Accumulate due payments until frozen
      {
        const probeInterval = 1000
        warpTime(probeInterval) // Advance time by 1000 seconds to accumulate rent fees
        await triggerAccountStateUpdate()
        const state = await getContractState()
        if (!state.accountState) {
          throw new Error('Account state is undefined! It probably got deleted.')
        }
        expect(state.account.account!.storageStats.duePayment).toBeDefined()
        const duePayments = state.account.account!.storageStats.duePayment!
        expect(duePayments).toBeGreaterThan(0n)
        expect(duePayments).toBeLessThan(dueLimits.delete_due_limit)

        const rent = Number(duePayments) / probeInterval
        console.log(`Rate: ${rent} nanoton/sec`)

        const expectedDue = (dueLimits.freeze_due_limit + dueLimits.delete_due_limit) / 2n // Must fall between freeze and delete limits

        const timeToFreeze = Math.floor(Number(expectedDue - duePayments + 1n) / rent)
        console.log(`Estimated time to freeze: ${timeToFreeze} sec`)
        warpTime(timeToFreeze)
        await triggerAccountStateUpdate()

        const stateFrozen = await getContractState()
        logAccountState(stateFrozen)

        expect(stateFrozen.balance).toBe(0n)
        expect(stateFrozen.account.account!.storageStats.duePayment).toBeGreaterThan(
          dueLimits.freeze_due_limit,
        )
        expect(stateFrozen.account.account!.storageStats.duePayment).toBeLessThan(
          dueLimits.delete_due_limit,
        )

        expect(['frozen', 'uninit']).toContain(stateFrozen.accountState!.type)
        console.log('Contract is frozen now.')
      }
    }

    // Unfreeze
    {
      console.log('Test unfreezing with initial status')
      {
        const freezerContract = blockchain.openContract(
          freezer.ContractClient.createFromFrozen(bind.freezer, stateInit), // Doesn't match current state
        )
        const result = await freezerContract.sendDeploy(deployer.getSender(), toNano('0.1'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: bind.freezer.address,
          success: false,
          exitCode: undefined,
        })
      }
      {
        const freezerContract = blockchain.openContract(
          freezer.ContractClient.createFromFrozen(bind.freezer, currentState),
        )
        const result = await freezerContract.sendDeploy(deployer.getSender(), toNano('0.1'))
        expect(result.transactions).toHaveTransaction({
          from: deployer.address,
          to: bind.freezer.address,
          success: true,
        })
        console.log('Unfrozen by deploy')
        const state = await getContractState()
        logAccountState(state)
        expect(state.account.account!.storage.state.type).toBe('active')
        if (!state.account.account!.storageStats.duePayment) {
          throw new Error(`Due payment should not have been cleared yet!`)
        }
        const netBalance = state.balance - state.account.account!.storageStats.duePayment!

        console.log('Trigger account update to pay dues')
        await triggerAccountStateUpdate() // Ensure contract is operational
        const state2 = await getContractState()
        logAccountState(state2)
        expect(state2.balance).toBe(netBalance)

        const value = await freezerContract.getValue()
        expect(value).toBe(42)
        console.log('Contract is unfrozen and operational again.')
      }
    }
  })

  function warpTime(period: number) {
    blockchain.now = blockchain.now!! + period
  }

  async function getContractState() {
    return await blockchain.getContract(bind.freezer.address)
  }

  async function triggerAccountStateUpdate() {
    const result = await bind.freezer.sendInternal(
      deployer.getSender(),
      toNano('1'),
      beginCell().storeUint(0xffffffff, 32).asCell(),
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.freezer.address,
      success: false, // The call must fail so it bounces the TON back
    })
    expect(result.transactions).toHaveTransaction({
      from: bind.freezer.address,
      to: deployer.address,
      inMessageBounced: true,
    })
  }
})

function logAccountState(state: SmartContract) {
  console.log(
    `Balance: ${state.balance} | Due: ${state.account.account!.storageStats.duePayment} | State: ${state.accountState?.type}`,
  )
}

function updateDueLimits(
  blockchain: Blockchain,
  dueLimits: { freeze_due_limit: bigint; delete_due_limit: bigint },
) {
  const oldConfig = loadConfig(blockchain.config)

  function fas(prevParam: GasLimitsPrices): GasLimitsPrices {
    console.log('Old limits:', prevParam)
    switch (prevParam.kind) {
      case 'GasLimitsPrices_gas_flat_pfx':
        const val: GasLimitsPrices_gas_flat_pfx = {
          ...prevParam,
          other: fas(prevParam.other),
        }
        return val

      case 'GasLimitsPrices_gas_prices': {
        const val: GasLimitsPrices_gas_prices = {
          ...prevParam,
          ...dueLimits,
        }
        return val
      }
      case 'GasLimitsPrices_gas_prices_ext': {
        const val: GasLimitsPrices_gas_prices_ext = {
          ...prevParam,
          ...dueLimits,
        }
        return val
      }
    }
  }
  const newGasLimit = fas(oldConfig[21].anon0)
  const updatedConfig = updateConfig(blockchain.config, {
    kind: 'ConfigParam_config_gas_prices',
    anon0: newGasLimit,
  })
  blockchain.setConfig(updatedConfig)
}
