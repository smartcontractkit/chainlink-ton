import { Address, beginCell, Cell, Contract, Message, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'

import {
  ContractCoverageConfig,
  CoverageConfigNames,
  generateCoverageArtifacts,
} from '../../coverage/coverage'

import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import * as wrongVersion from '../../../wrappers/examples/versioning/WrongVersion'
import * as typeAndVersion from '../../../wrappers/libraries/versioning/TypeAndVersion'

/**
 * Configuration for a single previous version to test upgrades from.
 */
export type PrevVersionConfig = {
  /** Version string for this previous version */
  version: string
  /** Function to get the code for this previous version */
  getCode: () => Promise<Cell>
  /** Function to deploy and setup a contract at this previous version */
  deploy: (
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<UpgradeableContract>>
}

/**
 * Configuration for testing upgrades between two versions of an upgradeable contract.
 */
export type UpgradeTestConfig<TCurrentVersionContract> = {
  /** The expected contract type name (e.g., 'link.chain.ton.examples.versioning.upgrades.UpgradeableCounter') */
  contractType: string
  /** Configurations for each supported previous version to test upgrades from */
  prevVersionConfigs: PrevVersionConfig[]
  /** Version string for current version contract */
  currentVersion: string
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
 * Configuration for testing the current version of an upgradeable contract.
 */
export type CurrentVersionTestConfig<TCurrentVersionContract> = {
  /** The expected contract type name (e.g., 'link.chain.ton.examples.versioning.upgrades.UpgradeableCounter') */
  contractType: string
  /** Version string for current version contract */
  currentVersion: string
  /** Function to get the code for current version contract */
  getCurrentCode: () => Promise<Cell>
  /** Constructor for current version contract */
  CurrentVersionConstructor: new (
    address: Address,
    init?: { code: Cell; data: Cell },
  ) => TCurrentVersionContract
  /** Amount of TON to use on sendUpgrade */
  upgradeValue?: bigint
  /** Function to deploy and setup the current version contract */
  deployCurrentContract: (
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<TCurrentVersionContract>>
}

/**
 * Contract interface that must be implemented by upgradeable contracts for testing.
 */
export interface UpgradeableContract
  extends upgradeable.Interface, typeAndVersion.Interface, Contract {}

interface PrevVersionSetup {
  version: string
  code: Cell
  contract: SandboxContract<UpgradeableContract>
}

interface TestSetup {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  nonOwner: SandboxContract<TreasuryContract>
  prevEntries: PrevVersionSetup[]
  currentCode: Cell
}

/**
 * Creates a reusable test suite for testing upgrades between two versions of an upgradeable contract.
 *
 * @param config Configuration for the upgrade tests
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const upgradeSpec = newUpgradeSpec({
 *   contractType: 'link.chain.ton.examples.versioning.upgrades.UpgradeableCounter',
 *   prevVersionConfigs: [
 *     {
 *       version: '1.0.0',
 *       getCode: () => UpgradeableCounterV1.code(),
 *       deploy: async (blockchain, owner) => {
 *         const codeV1 = await UpgradeableCounterV1.code()
 *         const contract = blockchain.openContract(
 *           UpgradeableCounterV1.createFromConfig(
 *             {
 *               id: 0,
 *               value: 0,
 *               ownable: { owner: owner.address, pendingOwner: null },
 *             },
 *             codeV1,
 *           ),
 *         )
 *         const deployer = await blockchain.treasury('deployer')
 *         await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
 *         return contract
 *       },
 *     },
 *   ],
 *   currentVersion: '2.0.0',
 *   getCurrentCode: () => UpgradeableCounterV2.code(),
 *   CurrentVersionConstructor: UpgradeableCounterV2,
 * })
 *
 * describe('UpgradeableCounter - Upgrade Tests', () => {
 *   upgradeSpec.run()
 * })
 * ```
 */
export function newUpgradeSpec<
  TContractV1 extends UpgradeableContract,
  TContractV2 extends UpgradeableContract,
>(config: UpgradeTestConfig<TContractV2>) {
  async function setup(blockchain: Blockchain): Promise<TestSetup> {
    const owner = await blockchain.treasury('owner')
    const nonOwner = await blockchain.treasury('nonOwner')
    const currentCode = await config.getCurrentCode()

    const prevEntries: PrevVersionSetup[] = []
    for (const pvc of config.prevVersionConfigs) {
      const code = await pvc.getCode()
      const contract = await pvc.deploy(blockchain, owner)
      prevEntries.push({ version: pvc.version, code, contract })
    }

    return {
      blockchain,
      owner,
      nonOwner,
      prevEntries,
      currentCode,
    }
  }

  const amount = config.upgradeValue ?? toNano('0.05')

  return {
    run: (coverageConfigs?: ContractCoverageConfig[]) => {
      let blockchain: Blockchain
      let testSetup: TestSetup

      beforeAll(async () => {
        blockchain = await Blockchain.create()
        blockchain.verbosity = {
          print: false,
          blockchainLogs: false,
          vmLogs: 'none',
          debugLogs: false,
        }
        if (process.env['COVERAGE'] === 'true') {
          blockchain.enableCoverage()
          blockchain.verbosity.print = false
          blockchain.verbosity.vmLogs = 'vm_logs_verbose'
        }
      })

      beforeEach(async () => {
        testSetup = await setup(blockchain)
      }, 90000) // Setup may download releases

      /**
       * Test that the contract deploys on the correct version (previous version)
       */
      it('should deploy on correct version', async () => {
        const { prevEntries } = testSetup

        for (const { version, code, contract } of prevEntries) {
          const typeAndVersion = await contract.getTypeAndVersion()
          expect(typeAndVersion.type).toBe(config.contractType)
          expect(typeAndVersion.version).toBe(version)

          const deployedCode = await contract.getCode()
          expect(deployedCode.toString('hex')).toBe(code.toString('hex'))

          const expectedHash = BigInt('0x' + code.hash().toString('hex'))
          const hash = await contract.getCodeHash()
          expect(hash).toBe(expectedHash)
        }
      })

      /**
       * Test that the contract can be upgraded from previous to current version
       */
      it('should upgrade from previous to current version', async () => {
        await upgradePrevToCurrent(testSetup)
      })

      async function upgradePrevToCurrent(testSetup: TestSetup): Promise<
        {
          currentVersionContracts: SandboxContract<UpgradeableContract>[]
        } & TestSetup
      > {
        const currentVersionContracts: SandboxContract<UpgradeableContract>[] = []

        for (const { contract: prevContract, version: prevVersion } of testSetup.prevEntries) {
          // Verify initial version
          const typeAndVersionPrev = await prevContract.getTypeAndVersion()
          expect(typeAndVersionPrev.type).toBe(config.contractType)
          expect(typeAndVersionPrev.version).toBe(prevVersion)

          // Perform upgrade
          const { upgradeResult, newVersionInstance } =
            await upgradeable.sendUpgradeAndReturnNewVersion(
              prevContract,
              testSetup.owner.getSender(),
              amount,
              config.CurrentVersionConstructor,
              testSetup.currentCode,
            )

          expect(upgradeResult.transactions).toHaveTransaction({
            from: testSetup.owner.address,
            to: prevContract.address,
            success: true,
          })

          const currentVersionContract: SandboxContract<UpgradeableContract> =
            testSetup.blockchain.openContract(newVersionInstance)

          // Verify code changed
          const upgradedCode = await currentVersionContract.getCode()
          expect(upgradedCode.toString('hex')).toBe(testSetup.currentCode.toString('hex'))

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
              tx.inMessage.info.dest.equals(prevContract.address),
          )
          const event = upgradeTransaction?.outMessages.values().find((msg: Message) => {
            return msg.info.type === 'external-out'
          })
          expect(event).toBeDefined()

          const upgradedEvent = upgradeable.builder.event.upgraded.load(event!.body.beginParse())
          expect(upgradedEvent.version).toBe(config.currentVersion)
          expect(upgradedEvent.code.toString('hex')).toBe(testSetup.currentCode.toString('hex'))
          expect(upgradedEvent.codeHash).toBe(expectedHash)

          currentVersionContracts.push(currentVersionContract)
        }

        return { currentVersionContracts, ...testSetup }
      }

      afterAll(async () => {
        if (process.env['COVERAGE'] === 'true' && coverageConfigs) {
          await generateCoverageArtifacts(blockchain, 'upgradeable_tests', coverageConfigs)
        }
      })
    },
  }
}

interface CurrentVersionTestSetup {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  nonOwner: SandboxContract<TreasuryContract>
  currentContract: SandboxContract<UpgradeableContract>
  currentCode: Cell
}

/**
 * Creates a reusable test suite for testing the current version of an upgradeable contract.
 *
 * @param config Configuration for the current version tests
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const currentVersionSpec = newCurrentVersionSpec({
 *   contractType: 'link.chain.ton.examples.versioning.upgrades.UpgradeableCounter',
 *   currentVersion: '2.0.0',
 *   getCurrentCode: () => UpgradeableCounterV2.code(),
 *   CurrentVersionConstructor: UpgradeableCounterV2,
 *   deployCurrentContract: async (blockchain, owner) => {
 *     const code = await UpgradeableCounterV2.code()
 *     const contract = blockchain.openContract(
 *       UpgradeableCounterV2.createFromConfig(
 *         {
 *           id: 0,
 *           value: 0,
 *           ownable: { owner: owner.address, pendingOwner: null },
 *         },
 *         code,
 *       ),
 *     )
 *     const deployer = await blockchain.treasury('deployer')
 *     await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
 *     return contract
 *   }
 * })
 *
 * describe('UpgradeableCounter - Current Version Tests', () => {
 *   currentVersionSpec.run()
 * })
 * ```
 */
export function newCurrentVersionSpec<TCurrentVersionContract extends UpgradeableContract>(
  config: CurrentVersionTestConfig<TCurrentVersionContract>,
) {
  async function setup(blockchain: Blockchain): Promise<CurrentVersionTestSetup> {
    const owner = await blockchain.treasury('owner')
    const nonOwner = await blockchain.treasury('nonOwner')
    const currentCode = await config.getCurrentCode()
    const currentContract: SandboxContract<UpgradeableContract> =
      await config.deployCurrentContract(blockchain, owner)

    return {
      blockchain,
      owner,
      nonOwner,
      currentContract,
      currentCode,
    }
  }

  const amount = config.upgradeValue ?? toNano('0.05')

  return {
    run: (contractName?: CoverageConfigNames) => {
      let blockchain: Blockchain
      let testSetup: CurrentVersionTestSetup

      beforeAll(async () => {
        blockchain = await Blockchain.create()
        blockchain.verbosity = {
          print: false,
          blockchainLogs: false,
          vmLogs: 'none',
          debugLogs: false,
        }
        if (process.env['COVERAGE'] === 'true') {
          blockchain.enableCoverage()
          blockchain.verbosity.print = false
          blockchain.verbosity.vmLogs = 'vm_logs_verbose'
        }
      })

      beforeEach(async () => {
        testSetup = await setup(blockchain)
      })

      /**
       * Test that the contract deploys on the correct version
       */
      it('should deploy on correct version', async () => {
        const { currentContract, currentCode } = testSetup

        const typeAndVersion = await currentContract.getTypeAndVersion()
        expect(typeAndVersion.type).toBe(config.contractType)
        expect(typeAndVersion.version).toBe(config.currentVersion)

        const code = await currentContract.getCode()
        expect(code.toString('hex')).toBe(currentCode.toString('hex'))

        const expectedHash = BigInt('0x' + currentCode.hash().toString('hex'))
        const hash = await currentContract.getCodeHash()
        expect(hash).toBe(expectedHash)
      })

      /**
       * Test that upgrade fails when a non-owner tries to upgrade
       */
      it('should fail when non-owner tries to upgrade', async () => {
        const { currentContract, nonOwner, currentCode } = testSetup

        // Verify initial version
        const typeAndVersion = await currentContract.getTypeAndVersion()
        expect(typeAndVersion.version).toBe(config.currentVersion)

        // Try to upgrade from non-owner address - should fail
        // Use some dummy code for the upgrade attempt
        const upgradeResult = await currentContract.sendUpgrade(nonOwner.getSender(), amount, {
          queryId: BigInt(Math.floor(Math.random() * 10000)),
          code: beginCell().endCell(), // Dummy code
        })

        expect(upgradeResult.transactions).toHaveTransaction({
          from: nonOwner.address,
          to: currentContract.address,
          success: false,
        })

        // Verify the contract is still on current version
        const finalVersion = await currentContract.getTypeAndVersion()
        expect(finalVersion.version).toBe(config.currentVersion)

        // Verify the code hasn't changed
        const code = await currentContract.getCode()
        expect(code.toString('hex')).toBe(currentCode.toString('hex'))
      })

      /**
       * Test that upgrade fails when fromVersion doesn't match current version
       */
      it('should fail when fromVersion does not match current version', async () => {
        const { owner, currentCode, blockchain } = testSetup

        const wrongVersionCode = await wrongVersion.ContractClient.code()
        const wrongVersionContract = blockchain.openContract(
          wrongVersion.ContractClient.createFromConfig(
            { id: 0, version: config.currentVersion + '-different' },
            wrongVersionCode,
          ),
        )
        {
          const result = await wrongVersionContract.sendDeploy(owner.getSender(), toNano('0.05'))
          expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: wrongVersionContract.address,
            success: true,
            deploy: true,
          })
        }

        // Try to upgrade with wrong fromVersion - should fail
        const upgradeResult = await wrongVersionContract.sendUpgrade(owner.getSender(), amount, {
          queryId: BigInt(Math.floor(Math.random() * 10000)),
          code: currentCode,
        })

        expect(upgradeResult.transactions).toHaveTransaction({
          from: owner.address,
          to: wrongVersionContract.address,
          success: false,
          exitCode: upgradeable.Error.VersionMismatch,
        })

        // Verify the code hasn't changed
        const code = await wrongVersionContract.getCode()
        expect(code.toString('hex')).toBe(wrongVersionCode.toString('hex'))
      })

      afterAll(async () => {
        if (process.env['COVERAGE'] === 'true' && contractName) {
          await generateCoverageArtifacts(blockchain, 'upgradeable_tests', [
            {
              code: await config.getCurrentCode(),
              name: contractName,
            },
          ])
        }
      })
    },
  }
}
