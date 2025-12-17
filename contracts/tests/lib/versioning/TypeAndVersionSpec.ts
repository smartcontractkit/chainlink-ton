import { Contract } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as typeAndVersion from '../../../wrappers/libraries/versioning/TypeAndVersion'
import { ContractCoverageConfig, generateCoverageArtifacts } from '../../coverage/coverage'

/**
 * Configuration for testing type and version
 */
export type TypeAndVersionTestConfig<TContract> = {
  /** The expected contract type name (e.g., 'com.chainlink.ton.ccip.FeeQuoter') */
  type: string
  /** Version string for current version contract */
  version: string
  /** Function to deploy and setup the contract */
  deployContract: (
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<TContract>>
}

/**
 * Contract interface that must be implemented by contracts for testing.
 */
export interface TypeAndVersionContract extends typeAndVersion.Interface, Contract {}

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
 * @param config Configuration for the type and version tests
 * @returns An object with a `run()` method that contains the test suite
 *
 * @example
 * ```typescript
 * import { MyContract } from '../wrappers/MyContract'
 * import { * } as TypeAndVersionSpec from './TypeAndVersionSpec'
 *
 * const typeAndVersionSpec = TypeAndVersionSpec.newInstance({
 *   type: 'com.chainlink.ton.examples.MyContract',
 *   version: '1.0.0',
 *   deployContract: async (blockchain, deployer) => {
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
 * })
 *
 * describe('MyContract - Type and Version Tests', () => {
 *   typeAndVersionSpec.run()
 * })
 * ```
 */
export function newInstance<TContract extends TypeAndVersionContract>(
  config: TypeAndVersionTestConfig<TContract>,
) {
  async function setup(): Promise<TestSetup> {
    const blockchain = await Blockchain.create()
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

    const deployer = await blockchain.treasury('deployer')
    const contract: SandboxContract<TypeAndVersionContract> = await config.deployContract(
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
    run: (coverageConfigs?: ContractCoverageConfig[]) => {
      /**
       * Test that the contract deploys on the current version
       */
      let blockchain: Blockchain
      let contract: SandboxContract<TypeAndVersionContract>
      beforeAll(async () => {
        const suiteSetup = await setup()
        blockchain = suiteSetup.blockchain
        contract = suiteSetup.contract
      })

      it('should deploy on current version', async () => {
        const typeAndVersion = await contract.getTypeAndVersion()
        expect(typeAndVersion.type).toBe(config.type)
        expect(typeAndVersion.version).toBe(config.version)
      })

      afterAll(async () => {
        if (process.env['COVERAGE'] === 'true' && coverageConfigs) {
          await generateCoverageArtifacts(blockchain, 'type_and_version_tests', coverageConfigs)
        }
      })
    },
  }
}
