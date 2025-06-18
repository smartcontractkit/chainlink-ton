import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { Cell, Message, toNano, Transaction } from '@ton/core'
import '@ton/test-utils'
import { UpgradeableWithLockV1 } from '../../../wrappers/examples/upgrades/UpgradeableWithLockV1'
import { UpgradeableWithLockV2 } from '../../../wrappers/examples/upgrades/UpgradeableWithLockV2'
import {
  loadUpgradedEvent,
  sendUpgradeAndReturnNewVersion,
} from '../../../wrappers/libraries/upgrades/Upgradeable'

async function setUpTest(i: number): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  upgradeableWithLock: SandboxContract<UpgradeableWithLockV1>
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

  let codeV1 = await UpgradeableWithLockV1.code()

  let upgradeableWithLock = blockchain.openContract(
    UpgradeableWithLockV1.createFromConfig(
      {
        id: 0,
        // owner.address,
      },
      codeV1,
    ),
  )

  const counterDeployResult = await upgradeableWithLock.sendDeploy(
    deployer.getSender(),
    toNano('0.05'),
  )

  expect(counterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: upgradeableWithLock.address,
    deploy: true,
    success: true,
  })

  return {
    blockchain,
    deployer,
    owner,
    upgradeableWithLock,
    codeV1,
    codeV2: await UpgradeableWithLockV2.code(),
  }
}

describe('UpgradeableWithLock', () => {
  it('should deploy', async () => {
    await setUpTest(0)
  })

  it('should deploy on version 1', async () => {
    let { upgradeableWithLock, codeV1 } = await setUpTest(0)
    const typeAndVersion = await upgradeableWithLock.getTypeAndVersion()
    expect(typeAndVersion.type).toBe('com.chainlink.ton.examples.upgrades.UpgradeableWithLock')
    expect(typeAndVersion.version).toBe('1.0.0')
    const currentCode = await upgradeableWithLock.getCode()
    const expectedHash = codeV1.hash()
    expect(currentCode.toString('hex')).toBe(codeV1.toString('hex'))
    const expectedHashBigInt = BigInt('0x' + expectedHash.toString('hex'))
    const hash = await upgradeableWithLock.getCodeHash()
    expect(hash).toBe(expectedHashBigInt)
  })

  it('unlocked should be upgraded to version 2', async () => {
    let {
      blockchain,
      owner,
      upgradeableWithLock: upgradeableWithLockV1,
      codeV2,
    } = await setUpTest(0)

    const typeAndVersion1 = await upgradeableWithLockV1.getTypeAndVersion()
    expect(typeAndVersion1.type).toBe('com.chainlink.ton.examples.upgrades.UpgradeableWithLock')
    expect(typeAndVersion1.version).toBe('1.0.0')

    let { upgradeResult, newVersionInstance } = await sendUpgradeAndReturnNewVersion(
      upgradeableWithLockV1,
      owner.getSender(),
      toNano('0.05'),
      UpgradeableWithLockV2,
    )
    expect(upgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradeableWithLockV1.address,
      success: true,
    })

    await validateUpgradeResults(
      blockchain,
      newVersionInstance,
      codeV2,
      upgradeResult,
      owner,
      upgradeableWithLockV1,
    )
  })

  it('locked should not be upgraded to version 2', async () => {
    let { owner, upgradeableWithLock: upgradeableWithLockV1, codeV1 } = await setUpTest(0)

    const typeAndVersion1 = await upgradeableWithLockV1.getTypeAndVersion()
    expect(typeAndVersion1.type).toBe('com.chainlink.ton.examples.upgrades.UpgradeableWithLock')
    expect(typeAndVersion1.version).toBe('1.0.0')

    await upgradeableWithLockV1.sendSwitchLock(owner.getSender(), { value: toNano('0.05') })

    await sendUpgradeAndReturnNewVersion(
      upgradeableWithLockV1,
      owner.getSender(),
      toNano('0.05'),
      UpgradeableWithLockV2,
    )

    const typeAndVersion2 = await upgradeableWithLockV1.getTypeAndVersion()
    expect(typeAndVersion2.type).toBe('com.chainlink.ton.examples.upgrades.UpgradeableWithLock')
    expect(typeAndVersion2.version).toBe('1.0.0')

    const code = await upgradeableWithLockV1.getCode()
    const expectedHash = codeV1.hash()
    expect(code.toString('hex')).toBe(codeV1.toString('hex'))
    const expectedHashBigInt = BigInt('0x' + expectedHash.toString('hex'))
    const hash = await upgradeableWithLockV1.getCodeHash()
    expect(hash).toBe(expectedHashBigInt)
  })

  it('unlocked after locked should be upgraded to version 2', async () => {
    let {
      blockchain,
      owner,
      upgradeableWithLock: upgradeableWithLockV1,
      codeV2,
    } = await setUpTest(0)

    const typeAndVersion1 = await upgradeableWithLockV1.getTypeAndVersion()
    expect(typeAndVersion1.type).toBe('com.chainlink.ton.examples.upgrades.UpgradeableWithLock')
    expect(typeAndVersion1.version).toBe('1.0.0')

    await upgradeableWithLockV1.sendSwitchLock(owner.getSender(), { value: toNano('0.05') })
    await upgradeableWithLockV1.sendSwitchLock(owner.getSender(), { value: toNano('0.05') })

    let { upgradeResult, newVersionInstance } = await sendUpgradeAndReturnNewVersion(
      upgradeableWithLockV1,
      owner.getSender(),
      toNano('0.05'),
      UpgradeableWithLockV2,
    )
    expect(upgradeResult.transactions).toHaveTransaction({
      from: owner.address,
      to: upgradeableWithLockV1.address,
      success: true,
    })

    await validateUpgradeResults(
      blockchain,
      newVersionInstance,
      codeV2,
      upgradeResult,
      owner,
      upgradeableWithLockV1,
    )
  })
})

async function validateUpgradeResults(
  blockchain: Blockchain,
  newVersionInstance: UpgradeableWithLockV2,
  codeV2: Cell,
  upgradeResult: SendMessageResult,
  owner: SandboxContract<TreasuryContract>,
  upgradeableWithLockV1: SandboxContract<UpgradeableWithLockV1>,
) {
  let upgradeableWithLockV2 = blockchain.openContract(newVersionInstance)

  const code = await upgradeableWithLockV2.getCode()
  const expectedHash = codeV2.hash()
  expect(code.toString('hex')).toBe(codeV2.toString('hex'))
  const expectedHashBigInt = BigInt('0x' + expectedHash.toString('hex'))
  const hash = await upgradeableWithLockV2.getCodeHash()
  expect(hash).toBe(expectedHashBigInt)

  const typeAndVersion2 = await upgradeableWithLockV2.getTypeAndVersion()
  expect(typeAndVersion2.type).toBe('com.chainlink.ton.examples.upgrades.UpgradeableWithLock')
  expect(typeAndVersion2.version).toBe('2.0.0')

  const upgradeTransaction = upgradeResult.transactions.find(
    (tx: Transaction) =>
      tx.inMessage?.info.type === 'internal' &&
      tx.inMessage.info.src.equals(owner.address) &&
      tx.inMessage.info.dest.equals(upgradeableWithLockV1.address),
  )
  const event = upgradeTransaction?.outMessages.values().find((msg: Message) => {
    return msg.info.type === 'external-out'
  })
  expect(event).toBeDefined()
  const upgradedEvent = loadUpgradedEvent(event!.body.beginParse())
  expect(upgradedEvent.version).toBe('2.0.0')
  expect(upgradedEvent.code.toString('hex')).toBe(codeV2.toString('hex'))
  expect(upgradedEvent.codeHash).toBe(expectedHashBigInt)
}
