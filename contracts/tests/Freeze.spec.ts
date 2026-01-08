import '@ton/test-utils'
import {
  Blockchain,
  defaultConfig,
  loadConfig,
  SandboxContract,
  TreasuryContract,
  updateConfig,
} from '@ton/sandbox'
import { beginCell, Cell, StateInit, StorageUsed, toNano } from '@ton/core'

import * as counter from '../wrappers/examples/Counter'
import {
  GasLimitsPrices,
  GasLimitsPrices_gas_flat_pfx,
  GasLimitsPrices_gas_prices,
  GasLimitsPrices_gas_prices_ext,
} from '@ton/sandbox/dist/config/config.tlb-gen'
import { generateRandomContractId } from '../src/utils'

describe('Contract freezing and unfreezing', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let bind: {
    counter: SandboxContract<counter.ContractClient>
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

    const counterData = {
      id: generateRandomContractId(),
      value: 0,
      ownable: { owner: deployer.address, pendingOwner: null },
    }
    code = await counter.ContractClient.code()
    deployer = await blockchain.treasury('deployer')

    bind = {
      counter: blockchain.openContract(
        counter.ContractClient.newFrom(
          {
            id: generateRandomContractId(),
            value: 0,
            ownable: { owner: deployer.address, pendingOwner: null },
          },
          code,
        ),
      ),
    }
  })

  it('should freeze and unfreeze', async () => {
    const initialTon = 1000000n
    var lastBalance = initialTon
    // Deploy
    var size: StorageUsed
    {
      const result = await bind.counter.sendDeploy(deployer.getSender(), initialTon)
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: bind.counter.address,
        deploy: true,
        success: true,
      })
      console.log('Deployed')
      const state = await getContractState()
      logAccountState(state)
      size = state.account.account!.storageStats.used
      lastBalance = state.balance
      expect(lastBalance).toBeLessThan(initialTon)
    }
    // Freeze
    {
      console.log('Freezing')
      const probeInterval = 100_000
      warpTime(probeInterval) // Advance time by 100k seconds to accumulate rent fees
      await triggerAccountStateUpdate()

      const state = await getContractState()
      logAccountState(state)
      expect(state.balance).toBeGreaterThan(0n)
      const difference = lastBalance - state.balance
      console.log(`Difference: ${difference} nanoton over ${probeInterval} sec`)
      expect(difference).toBeGreaterThan(0n)

      if (!state.accountState) {
        throw new Error('Account state is undefined! It probably got deleted.')
      }
      const rent = Number(difference) / probeInterval
      console.log(`Rate: ${rent} nanoton/sec`)

      const expectedDue = (dueLimits.freeze_due_limit + dueLimits.delete_due_limit) / 2n // Must fall between freeze and delete limits
      const timeToDrain = Math.floor(Number(state.balance + 1n) / rent)
      console.log(`Estimated time to drain: ${timeToDrain} sec`)
      warpTime(timeToDrain)
      await triggerAccountStateUpdate()

      const stateDrained = await getContractState()
      logAccountState(stateDrained)

      expect(stateDrained.balance).toBe(0n)
      expect(stateDrained.account.account!.storageStats.duePayment).toBeNull()

      expect(stateDrained.accountState!.type).toBe('active')

      const timeToFreeze = Math.floor(Number(expectedDue + 1n) / rent)
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

    function logAccountState(state) {
      console.log(
        `Balance: ${state.balance} | Due: ${state.account.account!.storageStats.duePayment} | State: ${state.accountState?.type}`,
      )
    }
  })

  function warpTime(period: number) {
    blockchain.now = blockchain.now!! + period
  }

  async function getContractState() {
    return await blockchain.getContract(bind.counter.address)
  }

  async function triggerAccountStateUpdate() {
    const result = await bind.counter.sendInternal(
      deployer.getSender(),
      toNano('1'),
      beginCell().storeUint(0xffffffff, 32).asCell(),
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.counter.address,
      success: false, // The call must fail so it bounces the TON back
    })
    expect(result.transactions).toHaveTransaction({
      from: bind.counter.address,
      to: deployer.address,
      inMessageBounced: true,
    })
  }
})
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
