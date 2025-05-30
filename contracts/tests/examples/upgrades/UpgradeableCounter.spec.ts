import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { Address, address, beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { UpgradeableCounterV1 } from '../../../build/UpgradeableCounterV1/tact_UpgradeableCounterV1'
import { UpgradeableCounterV2 } from '../../../build/UpgradeableCounterV2/tact_UpgradeableCounterV2'

async function setUpTest(i: bigint): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  upgradeableCounter: SandboxContract<UpgradeableCounterV1>
}> {
  // Verbosity = 'none' | 'vm_logs' | 'vm_logs_location' | 'vm_logs_gas' | 'vm_logs_full' | 'vm_logs_verbose';
  let blockchain = await Blockchain.create()
  blockchain.verbosity = {
    print: true,
    blockchainLogs: false,
    vmLogs: 'vm_logs',
    debugLogs: true,
  }

  let deployer = await blockchain.treasury('deployer')
  let owner = await blockchain.treasury('owner')

  let upgradeableCounter = blockchain.openContract(
    await UpgradeableCounterV1.fromInit(0n, owner.address, i),
  )

  const counterDeployResult = await upgradeableCounter.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
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
  }
}

describe('UpgradeableCounter', () => {
  // it('should deploy', async () => {
  //   await setUpTest(0n)
  // })

  // it('should deploy on version 1', async () => {
  //   let { upgradeableCounter } = await setUpTest(0n)
  //   const typeAndVersion = await upgradeableCounter.getTypeAndVersion()
  //   expect(typeAndVersion).toBe('com.chainlink.ton.examples.upgrades.UpgradeableCounter v1.0.0')
  //   const expectedCode = await V1Code()
  //   const code = await upgradeableCounter.getCode()
  //   const expectedHash = expectedCode.hash()
  //   expect(code.toString('hex')).toBe(expectedCode.toString('hex'))
  //   const expectedHashInt = BigInt('0x' + expectedHash.toString('hex'))
  //   const hash = await upgradeableCounter.getCodeHash()
  //   expect(hash).toBe(expectedHashInt)
  // })

  // it('should have initial value', async () => {
  //   let { blockchain, upgradeableCounter } = await setUpTest(0n)
  //   const user = await blockchain.treasury('user')
  //   const getterResult = await upgradeableCounter.getValue()
  //   expect(getterResult).toBe(0n)
  // })

  // it('version 1 should increase counter', async () => {
  //   let { blockchain, upgradeableCounter, owner } = await setUpTest(0n)
  //   const increaseTimes = 3
  //   for (let i = 0; i < increaseTimes; i++) {
  //     const increaser = await blockchain.treasury('increaser' + i)
  //     const counterBefore = await upgradeableCounter.getValue()
  //     const increaseBy = BigInt(1)

  //     let increaseResult = await upgradeableCounter.send(
  //       increaser.getSender(),
  //       {
  //         value: toNano('0.05'),
  //       },
  //       {
  //         $$type: 'Step',
  //         queryId: BigInt(Math.floor(Math.random() * 10000)),
  //       },
  //     )

  //     expect(increaseResult.transactions).toHaveTransaction({
  //       from: increaser.address,
  //       to: upgradeableCounter.address,
  //       success: true,
  //     })

  //     const getterResult = await upgradeableCounter.getValue()
  //     expect(getterResult).toBe(counterBefore + increaseBy)
  //   }
  // })

  it('should be upgraded to version 2', async () => {
    let { owner, upgradeableCounter } = await setUpTest(0n)

    const typeAndVersion1 = await upgradeableCounter.getTypeAndVersion()
    expect(typeAndVersion1).toBe('com.chainlink.ton.examples.upgrades.UpgradeableCounter v1.0.0')

    console.log('Upgrading to version 2...')
    let upgradeResult = await upgradeableCounter.send(
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
      to: upgradeableCounter.address,
      success: true,
    })
    console.log('Upgrade completed')

    const expectedCode = await V2Code()
    const code = await upgradeableCounter.getCode()
    const expectedHash = expectedCode.hash()
    expect(code.toString('hex')).toBe(expectedCode.toString('hex'))
    const expectedHashInt = BigInt('0x' + expectedHash.toString('hex'))
    const hash = await upgradeableCounter.getCodeHash()
    expect(hash).toBe(expectedHashInt)

    const typeAndVersion2 = await upgradeableCounter.getTypeAndVersion()
    expect(typeAndVersion2).toBe('com.chainlink.ton.examples.upgrades.UpgradeableCounter v2.0.0')
  })

  // it('version 2 should decrease the counter', async () => {
  //   let { blockchain, owner, upgradeableCounter } = await setUpTest(3n)

  //   await upgradeCounter(owner, upgradeableCounter)

  //   const decreaseTimes = 3
  //   for (let i = 0; i < decreaseTimes; i++) {
  //     const decreaser = await blockchain.treasury('decreaser' + i)

  //     const counterBefore = await upgradeableCounter.getValue()
  //     const decreaseBy = BigInt(1)

  //     let decreaseResult = await upgradeableCounter.send(
  //       decreaser.getSender(),
  //       {
  //         value: toNano('0.05'),
  //       },
  //       {
  //         $$type: 'Step',
  //         queryId: BigInt(Math.floor(Math.random() * 10000)),
  //       },
  //     )

  //     expect(decreaseResult.transactions).toHaveTransaction({
  //       from: decreaser.address,
  //       to: upgradeableCounter.address,
  //       success: true,
  //     })

  //     const getterResult = await upgradeableCounter.getValue()
  //     expect(getterResult).toBe(counterBefore - decreaseBy)
  //   }
  // })
})
async function V1Code(): Promise<Cell> {
  let init = (await UpgradeableCounterV1.fromInit(0n, zeroAddress(), 0n)).init
  if (init == null) {
    throw new Error('init is null')
  }
  return init.code
}

function zeroAddress(): Address {
  return Address.parseRaw('-1:0000000000000000000000000000000000000000000000000000000000000000')
}

async function V2Code(): Promise<Cell> {
  let init = (await UpgradeableCounterV2.fromInit(zeroAddress(), null, 0n, 0n)).init
  if (init == null) {
    throw new Error('init is null')
  }
  return init.code
}

async function upgradeCounter(
  owner: SandboxContract<TreasuryContract>,
  upgradeableCounter: SandboxContract<UpgradeableCounterV1>,
) {
  let code = await V2Code()
  let upgradeResult = await upgradeableCounter.send(
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
    to: upgradeableCounter.address,
    success: true,
  })
}
