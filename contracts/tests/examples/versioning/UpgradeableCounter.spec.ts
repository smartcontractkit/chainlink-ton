import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import * as upCounterV1 from '../../../wrappers/examples/versioning/UpgradeableCounterV1'
import * as upCounterV2 from '../../../wrappers/examples/versioning/UpgradeableCounterV2'
import { sendUpgradeAndReturnNewVersion } from '../../../wrappers/libraries/versioning/Upgradeable'
import { newUpgradeSpec, newCurrentVersionSpec } from '../../lib/versioning/UpgradeableSpec'

async function setUpTest(i: number): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  upgradeableCounter: SandboxContract<upCounterV1.ContractClient>
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

  let codeV1 = await upCounterV1.ContractClient.code()

  let upgradeableCounter = blockchain.openContract(
    upCounterV1.ContractClient.createFromConfig(
      {
        id: 0,
        value: i,
        ownable: { owner: owner.address, pendingOwner: null },
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
    codeV2: await upCounterV2.ContractClient.code(),
  }
}

describe('UpgradeableCounter - Upgrade Tests', () => {
  const upgradeSpec = newUpgradeSpec({
    contractType: upCounterV1.ContractClient.type(),
    prevVersion: upCounterV1.ContractClient.version(),
    currentVersion: upCounterV2.ContractClient.version(),
    getPrevCode: () => upCounterV1.ContractClient.code(),
    getCurrentCode: () => upCounterV2.ContractClient.code(),
    CurrentVersionConstructor: upCounterV2.ContractClient,
    deployPrevContract: async (blockchain, owner) => {
      const codeV1 = await upCounterV1.ContractClient.code()
      const contract = blockchain.openContract(
        upCounterV1.ContractClient.createFromConfig(
          {
            id: 0,
            value: 0,
            ownable: { owner: owner.address, pendingOwner: null },
          },
          codeV1,
        ),
      )
      const deployer = await blockchain.treasury('deployer')
      await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
      return contract
    },
  })
  upgradeSpec.run()
})

describe('UpgradeableCounter - Current Version Tests', () => {
  const currentVersionSpec = newCurrentVersionSpec({
    contractType: upCounterV2.ContractClient.type(),
    currentVersion: upCounterV2.ContractClient.version(),
    getCurrentCode: () => upCounterV2.ContractClient.code(),
    CurrentVersionConstructor: upCounterV2.ContractClient,
    deployCurrentContract: async (blockchain, owner) => {
      const code = await upCounterV2.ContractClient.code()
      const contract = blockchain.openContract(
        upCounterV2.ContractClient.createFromConfig(
          {
            id: 0,
            value: 0,
            ownable: { owner: owner.address, pendingOwner: null },
          },
          code,
        ),
      )
      const deployer = await blockchain.treasury('deployer')
      await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
      return contract
    },
  })
  currentVersionSpec.run()
})

describe('UpgradeableCounter - Unit Tests', () => {
  it('should deploy', async () => {
    await setUpTest(0)
  })

  // Contract-specific tests below

  it('should have initial value', async () => {
    let { upgradeableCounter } = await setUpTest(0)
    const getterResult = await upgradeableCounter.getValue()
    expect(getterResult).toBe(0)
  })

  it('version 1 should increase counter', async () => {
    let { blockchain, upgradeableCounter, owner } = await setUpTest(0)
    const increaseTimes = 3
    for (let i = 0; i < increaseTimes; i++) {
      const increaser = await blockchain.treasury('increaser' + i)
      const counterBefore = await upgradeableCounter.getValue()

      let increaseResult = await upgradeableCounter.sendStep(
        increaser.getSender(),
        toNano('0.05'),
        {
          queryId: BigInt(Math.floor(Math.random() * 10000)),
        },
      )

      expect(increaseResult.transactions).toHaveTransaction({
        from: increaser.address,
        to: upgradeableCounter.address,
        success: true,
      })

      const getterResult = await upgradeableCounter.getValue()
      expect(getterResult).toBe(counterBefore + 1)
    }
  })

  it('version 2 should decrease the counter', async () => {
    let { blockchain, owner, upgradeableCounter: upgradeableCounterV1 } = await setUpTest(3)

    const { upgradeResult, newVersionInstance } = await sendUpgradeAndReturnNewVersion(
      upgradeableCounterV1,
      owner.getSender(),
      toNano('0.05'),
      upCounterV2.ContractClient,
      await upCounterV2.ContractClient.code(),
    )

    expect(upgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradeableCounterV1.address,
      success: true,
    })

    let upgradeableCounterV2 = blockchain.openContract(newVersionInstance)

    const decreaseTimes = 3
    for (let i = 0; i < decreaseTimes; i++) {
      const decreaser = await blockchain.treasury('decreaser' + i)

      const counterBefore = await upgradeableCounterV2.getValue()

      let decreaseResult = await upgradeableCounterV2.sendStep(
        decreaser.getSender(),
        toNano('0.05'),
        {
          queryId: BigInt(Math.floor(Math.random() * 10000)),
        },
      )

      expect(decreaseResult.transactions).toHaveTransaction({
        from: decreaser.address,
        to: upgradeableCounterV2.address,
        success: true,
      })

      const getterResult = await upgradeableCounterV2.getValue()
      expect(getterResult).toBe(counterBefore - 1)
    }
  })

  it('should transfer ownership and allow new owner to upgrade', async () => {
    let { blockchain, owner, upgradeableCounter, codeV2 } = await setUpTest(0)
    const newOwner = await blockchain.treasury('newOwner')

    // Verify initial owner
    const initialOwner = await upgradeableCounter.getOwner()
    expect(initialOwner.equals(owner.address)).toBe(true)

    // Transfer ownership
    const transferResult = await upgradeableCounter.sendTransferOwnership(
      owner.getSender(),
      toNano('0.05'),
      {
        queryId: BigInt(Math.floor(Math.random() * 10000)),
        newOwner: newOwner.address,
      },
    )

    expect(transferResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradeableCounter.address,
      success: true,
    })

    // Verify pending owner is set
    const pendingOwner = await upgradeableCounter.getPendingOwner()
    expect(pendingOwner?.equals(newOwner.address)).toBe(true)

    // Accept ownership from new owner
    const acceptResult = await upgradeableCounter.sendAcceptOwnership(
      newOwner.getSender(),
      toNano('0.05'),
      {
        queryId: BigInt(Math.floor(Math.random() * 10000)),
      },
    )

    expect(acceptResult.transactions).toHaveTransaction({
      from: newOwner.address,
      to: upgradeableCounter.address,
      success: true,
    })

    // Verify ownership transfer is complete
    const currentOwner = await upgradeableCounter.getOwner()
    expect(currentOwner.equals(newOwner.address)).toBe(true)

    // Old owner should no longer be able to upgrade
    const oldOwnerUpgradeResult = await upgradeableCounter.sendUpgrade(
      owner.getSender(),
      toNano('0.05'),
      {
        queryId: BigInt(Math.floor(Math.random() * 10000)),
        code: codeV2,
      },
    )

    expect(oldOwnerUpgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradeableCounter.address,
      success: false,
    })

    // New owner should be able to upgrade
    let { upgradeResult, newVersionInstance } = await sendUpgradeAndReturnNewVersion(
      upgradeableCounter,
      newOwner.getSender(),
      toNano('0.05'),
      upCounterV2.ContractClient,
      await upCounterV2.ContractClient.code(),
    )

    expect(upgradeResult.transactions).toHaveTransaction({
      from: newOwner.address,
      to: upgradeableCounter.address,
      success: true,
    })

    let upgradeableCounterV2 = blockchain.openContract(newVersionInstance)

    // Verify the contract is now on version 2
    const typeAndVersion = await upgradeableCounterV2.getTypeAndVersion()
    expect(typeAndVersion.type).toBe(
      'link.chain.ton.examples.versioning.upgrades.UpgradeableCounter',
    )
    expect(typeAndVersion.version).toBe('2.0.0')

    // Verify new owner is still the owner after upgrade
    const finalOwner = await upgradeableCounterV2.getOwner()
    expect(finalOwner.equals(newOwner.address)).toBe(true)
  })
})
