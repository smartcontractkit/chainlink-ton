import { Address, Cell, Contract, ContractProvider, Message, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import { TypeAndVersion } from '../../../wrappers/libraries/TypeAndVersion'

/**
 * Configuration for testing an upgradeable contract.
 */
export type UpgradeableTestConfig<TContractV1, TContractV2> = {
  /** The expected contract type name (e.g., 'com.chainlink.ton.examples.upgrades.UpgradeableCounter') */
  contractType: string
  /** Version string for V1 contract */
  versionV1: string
  /** Version string for V2 contract */
  versionV2: string
  /** Function to get the code for V1 contract */
  getCodeV1: () => Promise<Cell>
  /** Function to get the code for V2 contract */
  getCodeV2: () => Promise<Cell>
  /** Constructor for V2 contract */
  V2Constructor: new (address: Address, init?: { code: Cell; data: Cell }) => TContractV2
  /** Amount of TON to use on sendUpgrade */
  upgradeValue?: bigint
}

/**
 * Contract interface that must be implemented by upgradeable contracts for testing.
 */
export interface UpgradeableContract extends upgradeable.Upgradeable, TypeAndVersion, Contract {}

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
 *     contractType: 'com.chainlink.ton.examples.upgrades.UpgradeableCounter',
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
  async function setup() {
    const blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: false,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: false,
    }

    const owner = await blockchain.treasury('owner')
    const nonOwner = await blockchain.treasury('nonOwner')
    const codeV1 = await config.getCodeV1()
    const codeV2 = await config.getCodeV2()
    const contractV1: SandboxContract<UpgradeableContract> = await setupV1Contract(
      blockchain,
      owner,
    )

    return {
      blockchain,
      owner,
      nonOwner,
      contractV1,
      codeV1,
      codeV2,
    }
  }

  const amount = config.upgradeValue ?? toNano('0.05')

  return {
    run: () => {
      /**
       * Test that the contract deploys on the correct version (V1)
       */
      it('should deploy on correct version', async () => {
        const { contractV1, codeV1 } = await setup()

        const typeAndVersion = await contractV1.getTypeAndVersion()
        expect(typeAndVersion.type).toBe(config.contractType)
        expect(typeAndVersion.version).toBe(config.versionV1)

        const currentCode = await contractV1.getCode()
        expect(currentCode.toString('hex')).toBe(codeV1.toString('hex'))

        const expectedHash = BigInt('0x' + codeV1.hash().toString('hex'))
        const hash = await contractV1.getCodeHash()
        expect(hash).toBe(expectedHash)
      })

      /**
       * Test that the contract can be upgraded from V1 to V2
       */
      it('should upgrade from V1 to V2', async () => {
        const { blockchain, owner, contractV1, codeV2 } = await setup()

        // Verify initial version
        const typeAndVersion1 = await contractV1.getTypeAndVersion()
        expect(typeAndVersion1.type).toBe(config.contractType)
        expect(typeAndVersion1.version).toBe(config.versionV1)

        // Perform upgrade
        const { upgradeResult, newVersionInstance } =
          await upgradeable.sendUpgradeAndReturnNewVersion(
            contractV1,
            owner.getSender(),
            amount,
            config.V2Constructor,
            config.versionV1,
            codeV2,
          )

        expect(upgradeResult.transactions).toHaveTransaction({
          from: owner.address,
          to: contractV1.address,
          success: true,
        })

        const contractV2: SandboxContract<UpgradeableContract> =
          blockchain.openContract(newVersionInstance)

        // Verify code changed
        const code = await contractV2.getCode()
        expect(code.toString('hex')).toBe(codeV2.toString('hex'))

        const expectedHash = BigInt('0x' + codeV2.hash().toString('hex'))
        const hash = await contractV2.getCodeHash()
        expect(hash).toBe(expectedHash)

        // Verify version changed
        const typeAndVersion2 = await contractV2.getTypeAndVersion()
        expect(typeAndVersion2.type).toBe(config.contractType)
        expect(typeAndVersion2.version).toBe(config.versionV2)

        // Verify upgrade event was emitted
        const upgradeTransaction = upgradeResult.transactions.find(
          (tx) =>
            tx.inMessage?.info.type === 'internal' &&
            tx.inMessage.info.src.equals(owner.address) &&
            tx.inMessage.info.dest.equals(contractV1.address),
        )
        const event = upgradeTransaction?.outMessages.values().find((msg: Message) => {
          return msg.info.type === 'external-out'
        })
        expect(event).toBeDefined()

        const upgradedEvent = upgradeable.loadUpgradedEvent(event!.body.beginParse())
        expect(upgradedEvent.version).toBe(config.versionV2)
        expect(upgradedEvent.code.toString('hex')).toBe(codeV2.toString('hex'))
        expect(upgradedEvent.codeHash).toBe(expectedHash)
      })

      /**
       * Test that upgrade fails when a non-owner tries to upgrade
       */
      const shouldFailWhenNonOwnerTriesToUpgrade = () => {
        it('should fail when non-owner tries to upgrade', async () => {
          const { nonOwner, contractV1, codeV2 } = await setup()

          // Try to upgrade from non-owner address - should fail
          const upgradeResult = await contractV1.sendUpgrade(nonOwner.getSender(), amount, {
            queryId: BigInt(Math.floor(Math.random() * 10000)),
            fromVersion: config.versionV1,
            code: codeV2,
          })

          expect(upgradeResult.transactions).toHaveTransaction({
            from: nonOwner.address,
            to: contractV1.address,
            success: false,
          })

          // Verify the contract is still on V1
          const typeAndVersion = await contractV1.getTypeAndVersion()
          expect(typeAndVersion.version).toBe(config.versionV1)
        })
      }

      /**
       * Test that upgrade fails when fromVersion doesn't match current version
       */
      it('should fail when fromVersion does not match current version', async () => {
        const { owner, contractV1, codeV1, codeV2 } = await setup()

        // Verify initial version
        const typeAndVersion = await contractV1.getTypeAndVersion()
        expect(typeAndVersion.version).toBe(config.versionV1)

        // Try to upgrade with wrong fromVersion - should fail
        const upgradeResult = await contractV1.sendUpgrade(owner.getSender(), amount, {
          queryId: BigInt(Math.floor(Math.random() * 10000)),
          fromVersion: config.versionV2, // Wrong version!
          code: codeV2,
        })

        expect(upgradeResult.transactions).toHaveTransaction({
          from: owner.address,
          to: contractV1.address,
          success: false,
          exitCode: upgradeable.Error.VersionMismatch,
        })

        // Verify the contract is still on V1
        const finalVersion = await contractV1.getTypeAndVersion()
        expect(finalVersion.version).toBe(config.versionV1)

        // Verify the code hasn't changed
        const currentCode = await contractV1.getCode()
        expect(currentCode.toString('hex')).toBe(codeV1.toString('hex'))
      })
    },
  }
}
