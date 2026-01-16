import { Address, Cell, Contract, toNano } from '@ton/core'
import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as coverage from '../../coverage/coverage'
import * as softFreeze from '../../../wrappers/libraries/funding/SoftFreeze'

/**
 * Configuration for testing soft freeze functionality.
 */
export type SoftFreezeTestConfig<TContract> = {
  /** Function to get the contract code */
  getCode: () => Promise<Cell>
  /** Constructor for the contract */
  ContractConstructor: new (address: Address, init?: { code: Cell; data: Cell }) => TContract
  /** The soft freeze threshold for the contract */
  softFreezeThreshold: bigint
  /** Function to deploy and setup the contract */
  deployContract: (
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
    initialBalance: bigint,
  ) => Promise<SandboxContract<TContract>>
  /** Function that calls an owner-only method that should work when soft frozen */
  callOwnerMethod: (
    contract: SandboxContract<TContract>,
    sender: SandboxContract<TreasuryContract>,
  ) => Promise<SendMessageResult>
  /** Function that calls a non-owner method that should fail when soft frozen */
  callNonOwnerMethod: (
    contract: SandboxContract<TContract>,
    sender: SandboxContract<TreasuryContract>,
  ) => Promise<SendMessageResult>
}

export type DeployFunction<TContract> = (
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  initialBalance: bigint,
) => Promise<SandboxContract<TContract>>

interface TestSetup<TContract> {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  nonOwner: SandboxContract<TreasuryContract>
  code: Cell
  deployContract: DeployFunction<TContract>
}

/**
 * Creates a reusable test suite for testing soft freeze functionality.
 *
 * @param config Configuration for the soft freeze tests
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const softFreezeSpec = newSoftFreezeSpec({
 *   getCode: () => FeeQuoter.code(),
 *   ContractConstructor: FeeQuoter,
 *   softFreezeThreshold: toNano('0.5'),
 *   belowOperationalBalanceErrorCode: 7000,
 *   deployContract: async (blockchain, owner, initialBalance) => {
 *     const code = await FeeQuoter.code()
 *     const contract = blockchain.openContract(
 *       FeeQuoter.createFromConfig(
 *         {
 *           owner: owner.address,
 *           // ... other config
 *         },
 *         code,
 *       ),
 *     )
 *     const deployer = await blockchain.treasury('deployer')
 *     await contract.sendDeploy(deployer.getSender(), initialBalance)
 *     return contract
 *   },
 *   callOwnerMethod: async (contract, sender) => {
 *     return contract.sendUpdateFeeTokens(sender.getSender(), {
 *       queryId: 0n,
 *       add: [],
 *       remove: [],
 *     })
 *   },
 *   callNonOwnerMethod: async (contract, sender) => {
 *     return contract.sendGetValidatedFee(sender.getSender(), {
 *       queryId: 0n,
 *       // ... message params
 *     })
 *   }
 * })
 *
 * describe('FeeQuoter SoftFreeze Tests', () => {
 *   softFreezeSpec.run()
 * })
 * ```
 */
export function newSoftFreezeSpec<TContract extends Contract>(
  config: SoftFreezeTestConfig<TContract>,
) {
  async function setup(): Promise<TestSetup<TContract>> {
    const blockchain = await Blockchain.create()
    blockchain.now = 1 // Pause time
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

    const owner = await blockchain.treasury('owner')
    const nonOwner = await blockchain.treasury('nonOwner')
    const code = await config.getCode()

    return {
      blockchain,
      owner,
      nonOwner,
      code,
      deployContract: config.deployContract,
    }
  }

  return {
    run: (coverageConfigs?: coverage.ContractCoverageConfig[]) => {
      let suiteSetup: TestSetup<TContract>
      let i = 0

      beforeEach(async () => {
        i++
        suiteSetup = await setup()
      })

      /**
       * Test that contract factory works correctly
       */
      it('should deploy contract with initial balance equal to expected', async () => {
        const { blockchain, owner, nonOwner, deployContract } = suiteSetup
        const initialBalance = config.softFreezeThreshold
        const contract = await deployContract(blockchain, owner, initialBalance)
        expect(await balance(blockchain, contract)).toBe(initialBalance)
      })

      /**
       * Test that contract is operational when balance is above threshold
       */
      it('should allow non-owner calls when balance is above threshold', async () => {
        const { blockchain, owner, nonOwner, deployContract } = suiteSetup
        const initialBalance = config.softFreezeThreshold + toNano('1')

        const contract = await deployContract(blockchain, owner, initialBalance)
        expect(await balance(blockchain, contract)).toBeGreaterThan(config.softFreezeThreshold)

        // Non-owner should be able to call methods when balance is above threshold
        const result = await config.callNonOwnerMethod(contract, nonOwner)

        expectLetMsgPass(result, nonOwner, contract)
      })

      /**
       * Test that contract rejects non-owner calls when balance is below threshold
       */
      it('should reject non-owner calls when balance is below threshold', async () => {
        const { blockchain, owner, nonOwner, deployContract } = suiteSetup
        const initialBalance = config.softFreezeThreshold / 2n

        const contract = await deployContract(blockchain, owner, initialBalance)
        expect(await balance(blockchain, contract)).toBeLessThan(config.softFreezeThreshold)

        // Non-owner should not be able to call methods when balance is below threshold
        const result = await config.callNonOwnerMethod(contract, nonOwner)

        expect(result.transactions).toHaveTransaction({
          from: nonOwner.address,
          to: contract.address,
          success: false,
          exitCode: softFreeze.Errors.BelowOperationalBalance,
        })
      })

      /**
       * Test that exactly at threshold behaves correctly
       */
      it('should allow non-owner calls when balance equals threshold', async () => {
        const { blockchain, owner, nonOwner, deployContract } = suiteSetup
        const initialBalance = config.softFreezeThreshold

        const contract = await deployContract(blockchain, owner, initialBalance)
        expect(await balance(blockchain, contract)).toBe(config.softFreezeThreshold)

        // Non-owner should be able to call when balance equals threshold
        const result = await config.callNonOwnerMethod(contract, nonOwner)

        expectLetMsgPass(result, nonOwner, contract)
      })

      /**
       * Test that owner can still call methods when balance is below threshold
       */
      it('should allow owner calls when balance is below threshold', async () => {
        const { blockchain, owner, deployContract } = suiteSetup
        const initialBalance = config.softFreezeThreshold / 2n

        const contract = await deployContract(blockchain, owner, initialBalance)
        expect(await balance(blockchain, contract)).toBeLessThan(config.softFreezeThreshold)

        // Owner should be able to call methods even when balance is below threshold
        const result = await config.callOwnerMethod(contract, owner)

        expectLetMsgPass(result, owner, contract)
      })

      /**
       * Test that funding the contract makes it operational again
       */
      it('should become operational for non-owners after funding above threshold', async () => {
        const { blockchain, owner, nonOwner, deployContract } = suiteSetup
        const initialBalance = config.softFreezeThreshold / 2n

        const contract = await deployContract(blockchain, owner, initialBalance)
        expect(await balance(blockchain, contract)).toBeLessThan(config.softFreezeThreshold)

        // Verify contract is soft frozen for non-owners
        const resultBeforeFunding = await config.callNonOwnerMethod(contract, nonOwner)
        expect(resultBeforeFunding.transactions).toHaveTransaction({
          from: nonOwner.address,
          to: contract.address,
          success: false,
          exitCode: softFreeze.Errors.BelowOperationalBalance,
        })

        // Fund the contract to bring it above threshold
        const funder = await blockchain.treasury('funder')
        const fundingAmount =
          config.softFreezeThreshold - (await balance(blockchain, contract)) + toNano('1')
        await funder.send({
          to: contract.address,
          value: fundingAmount,
        })
        expect(await balance(blockchain, contract)).toBeGreaterThan(config.softFreezeThreshold)

        // Now non-owner should be able to call methods
        const resultAfterFunding = await config.callNonOwnerMethod(contract, nonOwner)
        expectLetMsgPass(resultAfterFunding, nonOwner, contract)
      })

      afterEach(async () => {
        if (process.env['COVERAGE'] === 'true' && coverageConfigs) {
          await coverage.generateCoverageArtifacts(
            suiteSetup.blockchain,
            `soft_freeze_spec_tests_${i}`,
            coverageConfigs,
          )
        }
      })
    },
  }

  function expectLetMsgPass(
    result: SendMessageResult,
    nonOwner: SandboxContract<TreasuryContract>,
    contract: SandboxContract<TContract>,
  ) {
    expect(result.transactions).toHaveTransaction({
      from: nonOwner.address,
      to: contract.address,
      exitCode(x) {
        if (!x) {
          return true
        }
        return x != softFreeze.Errors.BelowOperationalBalance
      },
    })
  }

  async function balance<TContract extends Contract>(
    blockchain: Blockchain,
    contract: SandboxContract<TContract>,
  ) {
    return (await blockchain.getContract(contract.address)).balance
  }
}
