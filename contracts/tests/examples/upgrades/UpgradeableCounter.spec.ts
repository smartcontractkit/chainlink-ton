import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { Address, address, beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import {
  UpgradeableCounterV1,
  CounterConfig,
} from '../../../wrappers/examples/upgrades/UpgreableCounterV1'
import { compile } from '@ton/blueprint'

async function setUpTest(i: number): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  upgradeableCounter: SandboxContract<UpgradeableCounterV1>
  codeV1: Cell
  codeV2: Cell
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

  let codeV1 = await compile('examples.upgrades.UpgradeableCounterV1')

  let upgradeableCounter = blockchain.openContract(
    UpgradeableCounterV1.createFromConfig(
      {
        id: 0,
        value: i,
        // owner.address,
      },
      codeV1,
    ),
  )

  const counterDeployResult = await upgradeableCounter.sendDeploy(
    deployer.getSender(),
    toNano('0.05'),
  )

  expect(counterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: upgradeableCounter.address,
    deploy: true,
    success: true,
  })

  return {
    blockchain,
    deployer,
    owner,
    upgradeableCounter,
    codeV1,
    codeV2: await compile('examples.upgrades.UpgradeableCounterV2'),
  }
}

describe('UpgradeableCounter', () => {
  it('should deploy', async () => {
    await setUpTest(0)
  })

  it('should deploy on version 1', async () => {
    let { upgradeableCounter, codeV1 } = await setUpTest(0)
    const typeAndVersion = await upgradeableCounter.getTypeAndVersion()
    expect(typeAndVersion).toBe('com.chainlink.ton.examples.upgrades.UpgradeableCounter v1.0.0')
    const currentCode = await upgradeableCounter.getCode()
    const expectedHash = codeV1.hash()
    expect(currentCode.toString('hex')).toBe(codeV1.toString('hex'))
    const expectedHashInt = parseInt(expectedHash.toString('hex'), 16)
    const hash = await upgradeableCounter.getCodeHash()
    expect(hash).toBe(expectedHashInt)
  })

  it('should have initial value', async () => {
    let { blockchain, upgradeableCounter } = await setUpTest(0)
    const user = await blockchain.treasury('user')
    const getterResult = await upgradeableCounter.getValue()
    expect(getterResult).toBe(0)
  })

  it('version 1 should increase counter', async () => {
    let { blockchain, upgradeableCounter, owner } = await setUpTest(0)
    const increaseTimes = 3
    for (let i = 0; i < increaseTimes; i++) {
      const increaser = await blockchain.treasury('increaser' + i)
      const counterBefore = await upgradeableCounter.getValue()

      let increaseResult = await upgradeableCounter.sendStep(increaser.getSender(), {
        value: toNano('0.05'),
        queryId: Math.floor(Math.random() * 10000),
      })

      expect(increaseResult.transactions).toHaveTransaction({
        from: increaser.address,
        to: upgradeableCounter.address,
        success: true,
      })

      const getterResult = await upgradeableCounter.getValue()
      expect(getterResult).toBe(counterBefore + 1)
    }
  })

  it('should be upgraded to version 2', async () => {
    let { owner, upgradeableCounter, codeV2 } = await setUpTest(0)

    const typeAndVersion1 = await upgradeableCounter.getTypeAndVersion()
    expect(typeAndVersion1).toBe('com.chainlink.ton.examples.upgrades.UpgradeableCounter v1.0.0')

    let upgradeResult = await upgradeableCounter.sendUpgrade(owner.getSender(), {
      value: toNano('0.05'),
      code: codeV2,
    })
    expect(upgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradeableCounter.address,
      success: true,
    })

    const code = await upgradeableCounter.getCode()
    const expectedHash = codeV2.hash()
    expect(code.toString('hex')).toBe(codeV2.toString('hex'))
    const expectedHashInt = parseInt(expectedHash.toString('hex'), 16)
    const hash = await upgradeableCounter.getCodeHash()
    expect(hash).toBe(expectedHashInt)

    const typeAndVersion2 = await upgradeableCounter.getTypeAndVersion()
    expect(typeAndVersion2).toBe('com.chainlink.ton.examples.upgrades.UpgradeableCounter v2.0.0')
  })

  it('version 2 should decrease the counter', async () => {
    let { blockchain, owner, upgradeableCounter } = await setUpTest(3)

    await upgradeCounter(owner, upgradeableCounter)

    const decreaseTimes = 3
    for (let i = 0; i < decreaseTimes; i++) {
      const decreaser = await blockchain.treasury('decreaser' + i)

      const counterBefore = await upgradeableCounter.getValue()

      let decreaseResult = await upgradeableCounter.sendStep(decreaser.getSender(), {
        value: toNano('0.05'),
        queryId: Math.floor(Math.random() * 10000),
      })

      expect(decreaseResult.transactions).toHaveTransaction({
        from: decreaser.address,
        to: upgradeableCounter.address,
        success: true,
      })

      const getterResult = await upgradeableCounter.getValue()
      expect(getterResult).toBe(counterBefore - 1)
    }
  })
})

async function upgradeCounter(
  owner: SandboxContract<TreasuryContract>,
  upgradeableCounter: SandboxContract<UpgradeableCounterV1>,
) {
  let code = await compile('examples.upgrades.UpgradeableCounterV2')
  let upgradeResult = await upgradeableCounter.sendUpgrade(owner.getSender(), {
    value: toNano('0.05'),
    code,
  })
  expect(upgradeResult.transactions).toHaveTransaction({
    from: owner.address,
    to: upgradeableCounter.address,
    success: true,
  })
}
