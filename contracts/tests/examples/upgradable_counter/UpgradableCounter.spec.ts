import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { UpgradableCounterV1 } from '../../../build/UpgradableCounterV1/tact_UpgradableCounterV1'
import { UpgradableCounterV2 } from '../../../build/UpgradableCounterV2/tact_UpgradableCounterV2'

async function setUpTest(i: bigint): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  upgradableCounter: SandboxContract<UpgradableCounterV1>
}> {
  // Verbosity = 'none' | 'vm_logs' | 'vm_logs_location' | 'vm_logs_gas' | 'vm_logs_full' | 'vm_logs_verbose';
  let blockchain = await Blockchain.create()
  blockchain.verbosity = {
    print: true,
    blockchainLogs: false,
    vmLogs: 'none',
    debugLogs: true,
  }

  let deployer = await blockchain.treasury('deployer')
  let owner = await blockchain.treasury('owner')

  let upgradableCounter = blockchain.openContract(
    await UpgradableCounterV1.fromInit(0n, owner.address, i),
  )

  const counterDeployResult = await upgradableCounter.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
  )

  expect(counterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: upgradableCounter.address,
    deploy: true,
    success: true,
  })

  return {
    blockchain,
    deployer,
    owner,
    upgradableCounter,
  }
}

describe('UpgradableCounter', () => {
  it('should deploy', async () => {
    await setUpTest(0n)
  })

  it('should deploy on version 1', async () => {
    let { upgradableCounter } = await setUpTest(0n)
    const typeAndVersion = await upgradableCounter.getTypeAndVersion()
    expect(typeAndVersion).toBe(
      'com.chainlink.ton.examples.upgradable_counter.UpgradableCounter v1.0.0',
    )
  }, 100000)

  it('should have initial value', async () => {
    let { blockchain, upgradableCounter } = await setUpTest(0n)
    const user = await blockchain.treasury('user')
    const getterResult = await upgradableCounter.getValue()
    expect(getterResult).toBe(0n)
  }, 100000)

  it('version 1 should increase counter', async () => {
    let { blockchain, upgradableCounter, owner } = await setUpTest(0n)
    const increaseTimes = 3
    for (let i = 0; i < increaseTimes; i++) {
      const increaser = await blockchain.treasury('increaser' + i)
      const counterBefore = await upgradableCounter.getValue()
      const increaseBy = BigInt(1)

      let increaseResult = await upgradableCounter.send(
        increaser.getSender(),
        {
          value: toNano('0.05'),
        },
        {
          $$type: 'Step',
          queryId: BigInt(Math.floor(Math.random() * 10000)),
        },
      )

      expect(increaseResult.transactions).toHaveTransaction({
        from: increaser.address,
        to: upgradableCounter.address,
        success: true,
      })

      const getterResult = await upgradableCounter.getValue()
      expect(getterResult).toBe(counterBefore + increaseBy)
    }
  }, 100000)

  it('should be upgraded to version 2', async () => {
    let { owner, upgradableCounter } = await setUpTest(0n)

    const typeAndVersion1 = await upgradableCounter.getTypeAndVersion()
    expect(typeAndVersion1).toBe(
      'com.chainlink.ton.examples.upgradable_counter.UpgradableCounter v1.0.0',
    )

    let upgradeResult = await upgradableCounter.send(
      owner.getSender(),
      {
        value: toNano('0.05'),
      },
      {
        $$type: 'Upgrade',
        code: await V2Code(),
      },
    )
    expect(upgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradableCounter.address,
      success: true,
    })

    const typeAndVersion2 = await upgradableCounter.getTypeAndVersion()
    expect(typeAndVersion2).toBe(
      'com.chainlink.ton.examples.upgradable_counter.UpgradableCounter v2.0.0',
    )
  }, 100000)

  it('version 2 should decrease de counter', async () => {
    let { blockchain, owner, upgradableCounter } = await setUpTest(3n)

    await upgradeCounter(owner, upgradableCounter)

    const decreaseTimes = 3
    for (let i = 0; i < decreaseTimes; i++) {
      const decreaser = await blockchain.treasury('decreaser' + i)

      const counterBefore = await upgradableCounter.getValue()
      const decreaseBy = BigInt(1)

      let decreaseResult = await upgradableCounter.send(
        decreaser.getSender(),
        {
          value: toNano('0.05'),
        },
        {
          $$type: 'Step',
          queryId: BigInt(Math.floor(Math.random() * 10000)),
        },
      )

      expect(decreaseResult.transactions).toHaveTransaction({
        from: decreaser.address,
        to: upgradableCounter.address,
        success: true,
      })

      const getterResult = await upgradableCounter.getValue()
      expect(getterResult).toBe(counterBefore - decreaseBy)
    }
  }, 100000)
})

async function V2Code(): Promise<Cell> {
  let init = (await UpgradableCounterV2.fromInit(beginCell().endCell())).init
  if (init == null) {
    throw new Error('init is null')
  }
  return init.code
}

async function upgradeCounter(
  owner: SandboxContract<TreasuryContract>,
  upgradableCounter: SandboxContract<UpgradableCounterV1>,
) {
  let code = await V2Code()
  let upgradeResult = await upgradableCounter.send(
    owner.getSender(),
    {
      value: toNano('0.05'),
    },
    {
      $$type: 'Upgrade',
      code: code,
    },
  )
  expect(upgradeResult.transactions).toHaveTransaction({
    from: owner.address,
    to: upgradableCounter.address,
    success: true,
  })
}
