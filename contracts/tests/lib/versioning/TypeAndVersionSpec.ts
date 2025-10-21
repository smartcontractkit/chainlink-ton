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
 * Configuration for testing type and version
 */
export type TypeAndVersionTestConfig = {
  /** The expected contract type name (e.g., 'com.chainlink.ton.ccip.FeeQuoter') */
  type: string
  /** Version string for current version contract */
  version: string
}

/**
 * Contract interface that must be implemented by contracts for testing.
 */
export interface TypeAndVersionContract extends TypeAndVersion, Contract {}

interface TestSetup {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  contract: SandboxContract<TypeAndVersionContract>
}

/**
 * Creates a reusable test suite for testing type and version of a contract.
 *
 * This function generates a test suite that verifies a contract correctly implements
 * the TypeAndVersion interface by checking that `getTypeAndVersion()` returns the
 * expected type and version strings.
 *
 * @param config Configuration for the type and version tests containing:
 *   - type: The expected contract type name (e.g., 'com.chainlink.ton.ccip.FeeQuoter')
 *   - version: The expected version string (e.g., '1.0.0')
 * @param setupContract Function to deploy and setup the contract for testing.
 *   Receives a blockchain instance and deployer treasury, and should return the
 *   deployed contract wrapped in a SandboxContract.
 * @returns An object with a `run()` method that contains the test suite
 *
 * @example
 * ```typescript
 * import { MyContract } from '../wrappers/MyContract'
 * import { newTypeAndVersionSpec } from './TypeAndVersionSpec'
 *
 * const typeAndVersionSpec = newTypeAndVersionSpec(
 *   {
 *     type: 'com.chainlink.ton.examples.MyContract',
 *     version: '1.0.0',
 *   },
 *   async (blockchain, deployer) => {
 *     const contract = blockchain.openContract(
 *       MyContract.createFromConfig(
 *         {
 *           owner: deployer.address,
 *         },
 *         await MyContract.code(),
 *       ),
 *     )
 *     await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
 *     return contract
 *   }
 * )
 *
 * describe('MyContract - Type and Version Tests', () => {
 *   typeAndVersionSpec.run()
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
