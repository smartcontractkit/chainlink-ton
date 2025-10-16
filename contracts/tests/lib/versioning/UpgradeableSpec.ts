import { Address, Cell, Contract, ContractProvider, Message, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import { TypeAndVersion } from '../../../wrappers/libraries/TypeAndVersion'

/**
 * Configuration for testing an upgradeable contract.
 */
export type UpgradeableTestConfig<TPrevVersionContract, TCurrentVersionContract> = {
  /** The expected contract type name (e.g., 'com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter') */
  contractType: string
  /** Version string for previous version contract */
  prevVersion: string
  /** Version string for current version contract */
  currentVersion: string
  /** Function to get the code for previous version contract */
  getPrevCode: () => Promise<Cell>
  /** Function to get the code for current version contract */
  getCurrentCode: () => Promise<Cell>
  /** Constructor for current version contract */
  CurrentVersionConstructor: new (
    address: Address,
    init?: { code: Cell; data: Cell },
  ) => TCurrentVersionContract
  /** Amount of TON to use on sendUpgrade */
  upgradeValue?: bigint
}

/**
 * Contract interface that must be implemented by upgradeable contracts for testing.
 */
export interface UpgradeableContract extends upgradeable.Upgradeable, TypeAndVersion, Contract {}

interface TestSetup {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  nonOwner: SandboxContract<TreasuryContract>
  prevContract: SandboxContract<UpgradeableContract>
  prevCode: Cell
  currentCode: Cell
}

/**
 * Creates a reusable test suite for upgradeable contracts.
 *
 * @param config Configuration for the upgradeable contract tests
 * @param setupV1Contract Function to deploy and setup the V1 contract
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const upgradeableSpec = newUpgradeableInterfaceSpec(
 *   {
 *     contractType: 'com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter',
 *     versionV1: '1.0.0',
 *     versionV2: '2.0.0',
 *     getCodeV1: () => UpgradeableCounterV1.code(),
 *     getCodeV2: () => UpgradeableCounterV2.code(),
 *     V2Constructor: UpgradeableCounterV2,
 *   },
 *   async (blockchain, owner) => {
 *     const codeV1 = await UpgradeableCounterV1.code()
 *     const contract = blockchain.openContract(
 *       UpgradeableCounterV1.createFromConfig(
 *         {
 *           id: 0,
 *           value: 0,
 *           ownable: { owner: owner.address, pendingOwner: null },
 *         },
 *         codeV1,
 *       ),
 *     )
 *     const deployer = await blockchain.treasury('deployer')
 *     await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
 *     return contract
 *   }
 * )
 *
 * describe('UpgradeableCounter', () => {
 *   upgradeableSpec.shouldDeployOnCorrectVersion()
 *   upgradeableSpec.shouldUpgradeToV2()
 *   upgradeableSpec.shouldFailWhenNonOwnerTriesToUpgrade()
 *   upgradeableSpec.shouldFailWhenVersionMismatch()
 * })
 * ```
 */
export function newUpgradeableInterfaceSpec<
  TContractV1 extends UpgradeableContract,
  TContractV2 extends UpgradeableContract,
>(
  config: UpgradeableTestConfig<TContractV1, TContractV2>,
  setupV1Contract: (
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<TContractV1>>,
) {
  async function setup(): Promise<TestSetup> {
    const blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: false,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: false,
    }

    const owner = await blockchain.treasury('owner')
    const nonOwner = await blockchain.treasury('nonOwner')
    const prevCode = await config.getPrevCode()
    const currentCode = await config.getCurrentCode()
    const prevContract: SandboxContract<UpgradeableContract> = await setupV1Contract(
      blockchain,
      owner,
    )

    return {
      blockchain,
      owner,
      nonOwner,
      prevContract,
      prevCode,
      currentCode,
    }
  }

  const amount = config.upgradeValue ?? toNano('0.05')

  return {
    run: () => {
      /**
       * Test that the contract deploys on the correct version (V1)
       */
      it('should deploy on correct version', async () => {
        const { prevContract, prevCode } = await setup()

        const typeAndVersion = await prevContract.getTypeAndVersion()
        expect(typeAndVersion.type).toBe(config.contractType)
        expect(typeAndVersion.version).toBe(config.prevVersion)

        const currentCode = await prevContract.getCode()
        expect(currentCode.toString('hex')).toBe(prevCode.toString('hex'))

        const expectedHash = BigInt('0x' + prevCode.hash().toString('hex'))
        const hash = await prevContract.getCodeHash()
        expect(hash).toBe(expectedHash)
      })

      /**
       * Test that the contract can be upgraded from V1 to V2
       */
      it('should upgrade from V1 to V2', async () => {
        const testSetup = await setup()

        await upgradeV1ToV2(testSetup)
      })

      async function upgradeV1ToV2(testSetup: TestSetup): Promise<
        {
          currentVersionContract: SandboxContract<UpgradeableContract>
        } & TestSetup
      > {
        // Verify initial version
        const typeAndVersionPrev = await testSetup.prevContract.getTypeAndVersion()
        expect(typeAndVersionPrev.type).toBe(config.contractType)
        expect(typeAndVersionPrev.version).toBe(config.prevVersion)

        // Perform upgrade
        const { upgradeResult, newVersionInstance } =
          await upgradeable.sendUpgradeAndReturnNewVersion(
            testSetup.prevContract,
            testSetup.owner.getSender(),
            amount,
            config.CurrentVersionConstructor,
            config.prevVersion,
            testSetup.currentCode,
          )

        expect(upgradeResult.transactions).toHaveTransaction({
          from: testSetup.owner.address,
          to: testSetup.prevContract.address,
          success: true,
        })

        const currentVersionContract: SandboxContract<UpgradeableContract> =
          testSetup.blockchain.openContract(newVersionInstance)

        // Verify code changed
        const code = await currentVersionContract.getCode()
        expect(code.toString('hex')).toBe(testSetup.currentCode.toString('hex'))

        const expectedHash = BigInt('0x' + testSetup.currentCode.hash().toString('hex'))
        const hash = await currentVersionContract.getCodeHash()
        expect(hash).toBe(expectedHash)

        // Verify version changed
        const typeAndVersionCurrent = await currentVersionContract.getTypeAndVersion()
        expect(typeAndVersionCurrent.type).toBe(config.contractType)
        expect(typeAndVersionCurrent.version).toBe(config.currentVersion)

        // Verify upgrade event was emitted
        const upgradeTransaction = upgradeResult.transactions.find(
          (tx) =>
            tx.inMessage?.info.type === 'internal' &&
            tx.inMessage.info.src.equals(testSetup.owner.address) &&
            tx.inMessage.info.dest.equals(testSetup.prevContract.address),
        )
        const event = upgradeTransaction?.outMessages.values().find((msg: Message) => {
          return msg.info.type === 'external-out'
        })
        expect(event).toBeDefined()

        const upgradedEvent = upgradeable.loadUpgradedEvent(event!.body.beginParse())
        expect(upgradedEvent.version).toBe(config.currentVersion)
        expect(upgradedEvent.code.toString('hex')).toBe(testSetup.currentCode.toString('hex'))
        expect(upgradedEvent.codeHash).toBe(expectedHash)
        return { currentVersionContract, ...testSetup }
      }

      /**
       * Test that upgrade fails when a non-owner tries to upgrade
       */
      it('should fail when non-owner tries to upgrade', async () => {
        const { currentVersionContract, nonOwner, prevCode, currentCode } = await upgradeV1ToV2(
          await setup(),
        )

        // Verify initial version
        const typeAndVersion = await currentVersionContract.getTypeAndVersion()
        expect(typeAndVersion.version).toBe(config.currentVersion)

        // Try to upgrade from non-owner address - should fail
        const upgradeResult = await currentVersionContract.sendUpgrade(
          nonOwner.getSender(),
          amount,
          {
            queryId: BigInt(Math.floor(Math.random() * 10000)),
            fromVersion: config.currentVersion,
            code: prevCode,
          },
        )

        expect(upgradeResult.transactions).toHaveTransaction({
          from: nonOwner.address,
          to: currentVersionContract.address,
          success: false,
        })

        // Verify the contract is still on current version
        const finalVersion = await currentVersionContract.getTypeAndVersion()
        expect(finalVersion.version).toBe(config.currentVersion)

        // Verify the code hasn't changed
        const code = await currentVersionContract.getCode()
        expect(code.toString('hex')).toBe(currentCode.toString('hex'))
      })

      /**
       * Test that upgrade fails when fromVersion doesn't match current version
       */
      it('should fail when fromVersion does not match current version', async () => {
        const { owner, prevCode, currentCode, currentVersionContract } = await upgradeV1ToV2(
          await setup(),
        )

        // Verify initial version
        const typeAndVersion = await currentVersionContract.getTypeAndVersion()
        expect(typeAndVersion.version).toBe(config.currentVersion)

        // Try to upgrade with wrong fromVersion - should fail
        const upgradeResult = await currentVersionContract.sendUpgrade(owner.getSender(), amount, {
          queryId: BigInt(Math.floor(Math.random() * 10000)),
          fromVersion: config.prevVersion, // Wrong version!
          code: prevCode,
        })

        expect(upgradeResult.transactions).toHaveTransaction({
          from: owner.address,
          to: currentVersionContract.address,
          success: false,
          exitCode: upgradeable.Error.VersionMismatch,
        })

        // Verify the contract is still on current version
        const finalVersion = await currentVersionContract.getTypeAndVersion()
        expect(finalVersion.version).toBe(config.currentVersion)

        // Verify the code hasn't changed
        const code = await currentVersionContract.getCode()
        expect(code.toString('hex')).toBe(currentCode.toString('hex'))
      })

      // TODO: Should we test upgrading to a new placeholder version?
    },
  }
}
