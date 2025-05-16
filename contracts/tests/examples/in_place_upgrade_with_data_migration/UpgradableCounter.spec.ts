import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { Get, Getter } from '../../../build/Getter/tact_Getter'
import { UpgradableCounterAdd } from '../../../build/UpgradableCounterAdd/tact_UpgradableCounterAdd'
import {
  storeStateV2,
  UpgradableCounterSub,
} from '../../../build/UpgradableCounterSub/tact_UpgradableCounterSub'
import {
  HeaderUpgradable,
  InitParams,
} from '../../../build/UpgradableCounterSub/tact_UpgradableCounterAdd'

async function setUpTest(i: bigint): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  upgradableCounter: SandboxContract<UpgradableCounterAdd>
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

  let upgradableCounter = blockchain.openContract(
    await UpgradableCounterAdd.fromInit(0n, owner.address, i),
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
    upgradableCounter,
    getter,
  }
}

describe('AdvancedUpgradableCounter', () => {
  it('should deploy', async () => {
    await setUpTest(0n)
  })

  it('should deploy on version 1', async () => {
    let { upgradableCounter } = await setUpTest(0n)
    const typeAndVersion = await upgradableCounter.getTypeAndVersion()
    expect(typeAndVersion).toBe('UpgradableCounter v1.0.0')
  }, 100000)

  it('should have initial value', async () => {
    let { blockchain, upgradableCounter, getter } = await setUpTest(0n)
    const user = await blockchain.treasury('user')
    await assertCount(upgradableCounter, getter, user.getSender(), 0n)
  }, 100000)

  it('version 1 should increase counter', async () => {
    let { blockchain, upgradableCounter, owner, getter } = await setUpTest(0n)
    const increaseTimes = 3
    for (let i = 0; i < increaseTimes; i++) {
      const increaser = await blockchain.treasury('increaser' + i)
      const counterBefore = await getCount(getter, owner.getSender(), upgradableCounter)
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

      await assertCount(upgradableCounter, getter, owner.getSender(), counterBefore + increaseBy)
    }
  }, 100000)

  it('should be upgraded to version 2 after commit', async () => {
    let { owner, upgradableCounter, getter } = await setUpTest(0n)
    let header: HeaderUpgradable = {
      $$type: 'HeaderUpgradable',
      owner: owner.address,
    }
    let initParams: InitParams = {
      $$type: 'InitParams',
      header: header,
      stateToBeMigrated: beginCell().endCell(),
    }
    let substractorCounter = (await UpgradableCounterSub.fromInit(initParams)).init
    if (substractorCounter == null) {
      throw new Error('init is null')
    }
    let substractorCounterCode = substractorCounter.code
    let upgradeResult = await upgradableCounter.send(
      owner.getSender(),
      {
        value: toNano('0.05'),
      },
      {
        $$type: 'Upgrade',
        code: substractorCounterCode,
      },
    )
    expect(upgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradableCounter.address,
      success: true,
    })

    const typeAndVersion1 = await upgradableCounter.getTypeAndVersion()
    expect(typeAndVersion1).toBe('UpgradableCounter v1.0.0')

    let CommitUpgradeResult = await upgradableCounter.send(
      owner.getSender(),
      {
        value: toNano('0.05'),
      },
      {
        $$type: 'CommitUpgrade',
      },
    )
    expect(CommitUpgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradableCounter.address,
      success: true,
    })

    const typeAndVersion2 = await upgradableCounter.getTypeAndVersion()
    expect(typeAndVersion2).toBe('UpgradableCounter v2.0.0')
  }, 100000)

  it('uncommited version 2 should increase counter', async () => {
    let { blockchain, upgradableCounter, owner, getter } = await setUpTest(0n)

    await upgradeCounter(owner, upgradableCounter, await createSubCounterInit(owner))

    const increaseTimes = 3
    for (let i = 0; i < increaseTimes; i++) {
      const increaser = await blockchain.treasury('increaser' + i)
      const counterBefore = await getCount(getter, owner.getSender(), upgradableCounter)
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

      await assertCount(upgradableCounter, getter, owner.getSender(), counterBefore + increaseBy)
    }
  }, 100000)

  it('version 2 should decrease de counter', async () => {
    let { blockchain, owner, upgradableCounter, getter } = await setUpTest(3n)

    await upgradeCounter(owner, upgradableCounter, await createSubCounterInit(owner))
    await commitCounterUpgrade(owner, upgradableCounter)

    const decreaseTimes = 3
    for (let i = 0; i < decreaseTimes; i++) {
      const decreaser = await blockchain.treasury('decreaser' + i)

      const counterBefore = await getCount(getter, owner.getSender(), upgradableCounter)
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

      await assertCount(upgradableCounter, getter, owner.getSender(), counterBefore - decreaseBy)
    }
  }, 100000)

  // it('backroll should take us back to version 1 and it should increase de counter', async () => {
  //     let {
  //         blockchain,
  //         owner,
  //         upgradableCounter,
  //         getter,
  //     } = await setUpTest(3n);

  //     await upgradeCounter(owner, upgradableCounter, await createSubCounterInit(owner));
  //     await commitCounterUpgrade(owner, upgradableCounter);

  //     const version2 = await upgradableCounter.getVersion();
  //     expect(version2).toBe(2n);

  //     await rollbackUpgrade(owner, upgradableCounter);

  //     const version1 = await upgradableCounter.getVersion();
  //     expect(version1).toBe(1n);

  //     const increaseTimes = 3;
  //     for (let i = 0; i < increaseTimes; i++) {
  //         const increaser = await blockchain.treasury('increaser' + i);
  //         const counterBefore = await upgradableCounter.getCounter();
  //         const increaseBy = BigInt(1);

  //         let increaseResult = await upgradableCounter.send(
  //             increaser.getSender(),
  //             {
  //                 value: toNano('0.05'),
  //             },
  //             {
  //                 $$type: 'Step',
  //                 queryId: BigInt(Math.floor(Math.random() * 10000)),
  //             }
  //         );

  //         expect(increaseResult.transactions).toHaveTransaction({
  //             from: increaser.address,
  //             to: upgradableCounter.address,
  //             success: true,
  //         });

  //         await assertCount(upgradableCounter, getter, owner.getSender(), counterBefore + increaseBy);
  //     }
  // }, 100000);
})

async function createSubCounterInit(owner: SandboxContract<TreasuryContract>): Promise<Cell> {
  let header: HeaderUpgradable = {
    $$type: 'HeaderUpgradable',
    owner: owner.address,
  }
  let initParams: InitParams = {
    $$type: 'InitParams',
    header: header,
    stateToBeMigrated: beginCell().endCell(),
  }
  let init = (await UpgradableCounterSub.fromInit(initParams)).init
  if (init == null) {
    throw new Error('init is null')
  }
  return init.code
}

async function commitCounterUpgrade(
  owner: SandboxContract<TreasuryContract>,
  upgradableCounter: SandboxContract<UpgradableCounterAdd>,
) {
  let CommitUpgradeResult = await upgradableCounter.send(
    owner.getSender(),
    {
      value: toNano('0.05'),
    },
    {
      $$type: 'CommitUpgrade',
    },
  )
  expect(CommitUpgradeResult.transactions).toHaveTransaction({
    from: owner.address,
    to: upgradableCounter.address,
    success: true,
  })
}

async function upgradeCounter(
  owner: SandboxContract<TreasuryContract>,
  upgradableCounter: SandboxContract<UpgradableCounterAdd>,
  code: Cell,
) {
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

async function assertCount(
  upgradableCounter: SandboxContract<UpgradableCounterAdd>,
  getter: SandboxContract<Getter>,
  sender: Treasury,
  expectedCount: bigint,
) {
  const getterResult = await getCount(getter, sender, upgradableCounter)
  console.log('getterResult', getterResult)
  console.log('expectedCount', expectedCount)
  expect(getterResult).toBe(expectedCount)
}

async function getCount(
  getter: SandboxContract<Getter>,
  sender: Treasury,
  upgradableCounter: SandboxContract<UpgradableCounterAdd>,
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
      Address: upgradableCounter.address,
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
