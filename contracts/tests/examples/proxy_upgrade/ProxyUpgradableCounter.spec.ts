import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'
import '@ton/test-utils'
import { Get, Getter } from '../../../build/Getter/tact_Getter'
import { InitParams, ProxyCounter } from '../../../build/ProxyCounter/tact_ProxyCounter'
import { UpgradableProxyChildCounterAdd } from '../../../build/UpgradableProxyChildCounterAdd/tact_UpgradableProxyChildCounterAdd'
import { UpgradableProxyChildCounterSub } from '../../../build/UpgradableProxyChildCounterSub/tact_UpgradableProxyChildCounterSub'
// import { sleep } from '@ton/blueprint';

async function setUpTest(i: bigint): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  proxyCounter: SandboxContract<ProxyCounter>
  getter: SandboxContract<Getter>
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

  let responderCounter = blockchain.openContract(
    await UpgradableProxyChildCounterAdd.fromInit(0n, owner.address, i),
  )

  const responderCounterDeployResult = await responderCounter.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
  )

  expect(responderCounterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: responderCounter.address,
    deploy: true,
    success: true,
  })

  let proxyCounter = blockchain.openContract(
    await ProxyCounter.fromInit(0n, owner.address, responderCounter.address),
  )

  const proxyCounterDeployResult = await proxyCounter.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
  )

  expect(proxyCounterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: proxyCounter.address,
    deploy: true,
    success: true,
  })

  let getter = blockchain.openContract(await Getter.fromInit(0n, owner.address, 0n))

  const getterDeployResult = await getter.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
  )

  expect(getterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: getter.address,
    deploy: true,
    success: true,
  })

  return {
    blockchain,
    deployer,
    owner,
    proxyCounter,
    getter,
  }
}

describe('ProxyUpgradableCounter', () => {
  it('should deploy', async () => {
    await setUpTest(0n)
  })

  it('should deploy on version 1', async () => {
    let { proxyCounter } = await setUpTest(0n)
    const typeAndVersion = await proxyCounter.getTypeAndVersion()
    expect(typeAndVersion).toBe('com.chainlink.ton.examples.proxy_upgrade.ProxyCounter v1.0.0')
  }, 100000)

  it('should have initial value', async () => {
    let { blockchain, proxyCounter, getter } = await setUpTest(0n)
    const user = await blockchain.treasury('user')
    const getterResult = await getCount(getter, user.getSender(), proxyCounter)
    expect(getterResult).toBe(0n)
  }, 100000)

  it('version 1 should increase counter', async () => {
    let { blockchain, proxyCounter, owner, getter } = await setUpTest(0n)
    const increaseTimes = 3
    for (let i = 0; i < increaseTimes; i++) {
      const increaser = await blockchain.treasury('increaser' + i)
      const counterBefore = await getCount(getter, increaser.getSender(), proxyCounter)

      const increaseBy = BigInt(1)

      let increaseResult = await proxyCounter.send(
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
        to: proxyCounter.address,
        success: true,
      })

      const getterResult = await getCount(getter, owner.getSender(), proxyCounter)
      expect(getterResult).toBe(counterBefore + increaseBy)
    }
  }, 100000)

  it('should be upgraded to version 2', async () => {
    let { owner, proxyCounter } = await setUpTest(0n)
    let subtractorCounterCode = await getSubtractorCode(owner)
    await upgradeAndCommit(proxyCounter, owner, subtractorCounterCode)

    const typeAndVersion = await proxyCounter.getTypeAndVersion()
    expect(typeAndVersion).toBe('com.chainlink.ton.examples.proxy_upgrade.ProxyCounter v2.0.0')
  }, 100000)

  it('upgrade should conserve the internal state', async () => {
    const initialValue = 10n
    let { owner, proxyCounter, getter } = await setUpTest(initialValue)
    const initialId = await proxyCounter.getId()
    let subtractorCounterCode = await getSubtractorCode(owner)
    await upgradeAndCommit(proxyCounter, owner, subtractorCounterCode)

    const getterResult = await getCount(getter, owner.getSender(), proxyCounter)
    expect(getterResult).toBe(initialValue)
  }, 100000)

  it('version 2 should decrease de counter', async () => {
    let { blockchain, owner, proxyCounter, getter } = await setUpTest(3n)
    let initParams: InitParams = {
      $$type: 'InitParams',
      header: {
        $$type: 'HeaderUpgradable',
        owner: owner.address,
      },
      stateToBeMigrated: beginCell().endCell(),
    }
    let subtractorCounterCode = await getSubtractorCode(owner)
    await upgradeAndCommit(proxyCounter, owner, subtractorCounterCode)

    const decreaseTimes = 3
    for (let i = 0; i < decreaseTimes; i++) {
      const decreaser = await blockchain.treasury('decreaser' + i)

      const counterBefore = await getCount(getter, decreaser.getSender(), proxyCounter)
      const decreaseBy = BigInt(1)

      let decreaseResult = await proxyCounter.send(
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
        to: proxyCounter.address,
        success: true,
      })

      const getterResult = await getCount(getter, owner.getSender(), proxyCounter)
      expect(getterResult).toBe(counterBefore - decreaseBy)
    }
  }, 100000)
})

async function upgradeAndCommit(
  proxyCounter: SandboxContract<ProxyCounter>,
  owner: SandboxContract<TreasuryContract>,
  subtractorCounterCode,
) {
  let upgradeResult = await proxyCounter.send(
    owner.getSender(),
    {
      value: toNano('1'),
    },
    {
      $$type: 'Upgrade',
      code: subtractorCounterCode,
    },
  )
  expect(upgradeResult.transactions).toHaveTransaction({
    from: owner.address,
    to: proxyCounter.address,
    success: true,
  })

  let commitUpgradeResult = await proxyCounter.send(
    owner.getSender(),
    {
      value: toNano('1'),
    },
    {
      $$type: 'CommitUpgrade',
    },
  )
  expect(commitUpgradeResult.transactions).toHaveTransaction({
    from: owner.address,
    to: proxyCounter.address,
    success: true,
  })
}

async function getSubtractorCode(owner: SandboxContract<TreasuryContract>) {
  let initParams: InitParams = {
    $$type: 'InitParams',
    header: {
      $$type: 'HeaderUpgradable',
      owner: owner.address,
    },
    stateToBeMigrated: beginCell().endCell(),
  }
  let subtractorCounter = await UpgradableProxyChildCounterSub.fromInit(initParams)
  if (subtractorCounter.init == null) {
    throw new Error('init is null')
  }
  let subtractorCounterCode = subtractorCounter.init.code
  return subtractorCounterCode
}

async function getCount(
  getter: SandboxContract<Getter>,
  sender: Treasury,
  proxyCounter: SandboxContract<ProxyCounter>,
) {
  const getterDeployResult = await getter.send(
    sender,
    {
      value: toNano('0.05'),
    },
    {
      $$type: 'Get',
      queryId: BigInt(Math.floor(Math.random() * 10000)),
      opcode: 0n,
      Address: proxyCounter.address,
    },
  )

  expect(getterDeployResult.transactions).toHaveTransaction({
    from: sender.address,
    to: getter.address,
    deploy: false,
    success: true,
  })

  const getterResult = await getter.getResponse()
  return getterResult
}
