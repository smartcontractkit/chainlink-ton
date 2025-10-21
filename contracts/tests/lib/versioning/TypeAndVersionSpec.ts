import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Message,
  Sender,
  toNano,
} from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'
import { TypeAndVersion } from '../../../wrappers/libraries/versioning/TypeAndVersion'

/**
 * Configuration for testing upgrades between two versions of an upgradeable contract.
 */
export type TypeAndVersionTestConfig = {
  /** The expected contract type name (e.g., 'com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter') */
  type: string
  /** Version string for current version contract */
  version: string
}

/**
 * Contract interface that must be implemented by upgradeable contracts for testing.
 */
export interface TypeAndVersionContract extends upgradeable.Upgradeable, TypeAndVersion, Contract {}

interface TestSetup {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  contract: SandboxContract<TypeAndVersionContract>
}

/**
 * Creates a reusable test suite for testing upgrades between two versions of an upgradeable contract.
 *
 * @param config Configuration for the upgrade tests
 * @param setupContract Function to deploy and setup the previous version contract
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const upgradeSpec = newUpgradeSpec(
 *   {
 *     contractType: 'com.chainlink.ton.examples.versioning.upgrades.UpgradeableCounter',
 *     prevVersion: '1.0.0',
 *     currentVersion: '2.0.0',
 *     getPrevCode: () => UpgradeableCounterV1.code(),
 *     getCurrentCode: () => UpgradeableCounterV2.code(),
 *     CurrentVersionConstructor: UpgradeableCounterV2,
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
 * describe('UpgradeableCounter - Upgrade Tests', () => {
 *   upgradeSpec.run()
 * })
 * ```
 */
export function newTypeAndVersionSpec<TContract extends TypeAndVersionContract>(
  config: TypeAndVersionTestConfig,
  setupContract: (
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<TContract>>,
) {
  async function setup(): Promise<TestSetup> {
    const blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: false,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: false,
    }

    const deployer = await blockchain.treasury('deployer')
    const contract: SandboxContract<TypeAndVersionContract> = await setupContract(
      blockchain,
      deployer,
    )

    return {
      blockchain,
      owner: deployer,
      contract,
    }
  }

  return {
    run: () => {
      /**
       * Test that the contract deploys on the current version
       */
      it('should deploy on current version', async () => {
        const { contract } = await setup()

        const typeAndVersion = await contract.getTypeAndVersion()
        expect(typeAndVersion.type).toBe(config.type)
        expect(typeAndVersion.version).toBe(config.version)
      })
    },
  }
}
