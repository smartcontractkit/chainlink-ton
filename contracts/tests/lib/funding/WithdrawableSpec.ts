import {
  Blockchain,
  BlockchainTransaction,
  SandboxContract,
  SendMessageResult,
  TreasuryContract,
} from '@ton/sandbox'
import {
  Address,
  Cell,
  CommonMessageInfoInternal,
  Message,
  toNano,
  TransactionActionPhase,
  TransactionComputeVm,
  TransactionDescriptionGeneric,
} from '@ton/core'
import '@ton/test-utils'
import * as withdrawable from '../../../wrappers/libraries/funding/Withdrawable'
import { sleep } from '@ton/blueprint'

/**
 * Configuration for testing withdrawable functionality.
 */
export type WithdrawableTestConfig<TContract> = {
  /** Function to get the contract code */
  getCode: () => Promise<Cell>
  /** Constructor for the contract */
  ContractConstructor: new (address: Address, init?: { code: Cell; data: Cell }) => TContract
  /** Expected error code when a non-owner tries to withdraw */
  ownershipErrorCode: number
  /** Function to deploy and setup the contract */
  deployContract: (
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<TContract>>
}

interface TestSetup<TContract> {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  nonOwner: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  contract: SandboxContract<TContract & withdrawable.Interface>
  code: Cell
}

/**
 * Creates a reusable test suite for testing withdrawable functionality.
 *
 * @param config Configuration for the withdrawable tests
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const withdrawableSpec = newWithdrawableSpec({
 *   getCode: () => WithdrawableWallet.code(),
 *   ContractConstructor: WithdrawableWallet,
 *   ownershipErrorCode: 1001,
 *   setupContract: async (blockchain, owner) => {
 *     const code = await WithdrawableWallet.code()
 *     const contract = blockchain.openContract(
 *       WithdrawableWallet.createFromConfig(
 *         {
 *           owner: owner.address,
 *           reserve: toNano('1'),
 *         },
 *         code,
 *       ),
 *     )
 *     const deployer = await blockchain.treasury('deployer')
 *     await contract.sendDeploy(deployer.getSender(), toNano('10'))
 *     return contract
 *   }
 * })
 *
 * describe('WithdrawableWallet Tests', () => {
 *   withdrawableSpec.run()
 * })
 * ```
 */
export function newWithdrawableSpec<TContract extends withdrawable.Interface>(
  config: WithdrawableTestConfig<TContract>,
) {
  const withdrawValue = toNano('0.05')
  const minimumBalance = toNano('10')
  var defaultReserve: bigint
  async function setup(): Promise<TestSetup<TContract>> {
    const blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: false,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: false,
    }

    const owner = await blockchain.treasury('owner')
    const nonOwner = await blockchain.treasury('nonOwner')
    const recipient = await blockchain.treasury('recipient')
    const code = await config.getCode()
    const contract = await config.deployContract(blockchain, owner)
    const balance = (await blockchain.getContract(contract.address)).balance
    defaultReserve = await (contract as SandboxContract<withdrawable.Interface>).getReserve()
    if (balance < defaultReserve + minimumBalance) {
      const funder = await blockchain.treasury('funder')
      const res = await funder.send({
        value: minimumBalance,
        to: contract.address,
      })
      expect(res.transactions).toHaveTransaction({
        from: funder.address,
        to: contract.address,
        success: true,
      })
    }

    return {
      blockchain,
      owner,
      nonOwner,
      recipient,
      contract,
      code,
    }
  }

  // Helper function to create a custom reserve higher than the default
  function customReserveAboveDefault(balance: bigint): bigint {
    const val = defaultReserve + (balance - defaultReserve) / 2n
    expect(val).toBeGreaterThan(defaultReserve)
    expect(val).toBeLessThan(balance)
    return val
  }

  // Helper function to create a custom reserve lower than the default
  function customReserveBelowDefault(): bigint {
    const val = defaultReserve / 2n
    expect(val).toBeLessThan(defaultReserve)
    return val
  }

  // Helper function to calculate withdrawal amount that is half of available funds above a reserve
  function withdrawWithoutHittingReserve(balance: bigint, reserve: bigint): bigint {
    const withdrawAmount = (balance - reserve) / 2n
    expect(withdrawAmount).toBeGreaterThan(0n)
    expect(withdrawAmount).toBeLessThan(balance)
    expect(balance - withdrawAmount).toBeGreaterThan(reserve)
    return withdrawAmount
  }

  // Helper function to calculate withdrawal amount that leaves the balance between two reserve values
  function withdrawLeavingBalanceBetweenReserves(
    balance: bigint,
    lowerReserve: bigint,
    higherReserve: bigint,
  ): bigint {
    expect(higherReserve).toBeGreaterThan(lowerReserve)
    const withdrawAmount = balance - (lowerReserve + higherReserve) / 2n
    expect(withdrawAmount).toBeGreaterThan(0n)
    expect(withdrawAmount).toBeLessThan(balance)
    expect(balance - withdrawAmount).toBeGreaterThan(lowerReserve)
    expect(balance - withdrawAmount).toBeLessThan(higherReserve)
    return withdrawAmount
  }

  // Helper function to calculate withdrawal amount that leaves half of a reserve
  function withdrawHittingReserve(balance: bigint, reserve: bigint): bigint {
    const withdrawAmount = balance - reserve / 2n
    expect(withdrawAmount).toBeGreaterThan(0n)
    expect(withdrawAmount).toBeLessThan(balance)
    expect(balance - withdrawAmount).toBeLessThan(reserve)
    return withdrawAmount
  }

  return {
    run: () => {
      /**
       * Test that only the owner can withdraw
       */
      it('should fail when non-owner tries to withdraw', async () => {
        const { contract, nonOwner, recipient } = await setup()

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          nonOwner.getSender(),
          withdrawValue,
          {
            queryId: 0n,
            destination: recipient.address,
            amount: toNano('1'),
            reserve: undefined,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: nonOwner.address,
          to: contract.address,
          success: false,
          exitCode: config.ownershipErrorCode,
        })
      })

      /**
       * Test that the contract can withdraw a specific amount
       */
      it('should withdraw specific amount', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance
        const withdrawAmount = withdrawWithoutHittingReserve(initialBalance, defaultReserve)

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 1n,
            destination: recipient.address,
            amount: withdrawAmount,
            reserve: undefined,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: true,
          value: withdrawValue,
        })
        const tx = searchTX(result, contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(withdrawAmount + remainingMessageValue(tx))

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(
          initialBalance -
            withdrawAmount -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n),
        )
      })

      /**
       * Test that withdrawal fails when trying to withdraw more than balance
       */
      it('should fail when withdrawing more than balance', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const tooMuchAmount = contractBalance + toNano('1')

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 2n,
            destination: recipient.address,
            amount: tooMuchAmount,
            reserve: undefined,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.InsufficientBalance,
        })
      })

      /**
       * Test that withdrawal respects reserve when not overwriten
       */
      it('should respect reserve when not overwriten', async () => {
        const { contract, owner, recipient, blockchain } = await setup()
        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const attemptedAmount = withdrawHittingReserve(contractBalance, defaultReserve)

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 3n,
            destination: recipient.address,
            amount: attemptedAmount,
            reserve: undefined,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.HitReserve,
        })
      })

      /**
       * Test that withdrawal can bypass reserve when overwriten
       */
      it('should bypass reserve when overwriten', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const attemptedAmount = withdrawHittingReserve(contractBalance, defaultReserve)

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 4n,
            destination: recipient.address,
            amount: attemptedAmount,
            reserve: toNano('0'), // Disable reserve protection
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: true,
          value: withdrawValue,
        })
        const tx = searchTX(result, contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(attemptedAmount + remainingMessageValue(tx))

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(
          contractBalance -
            attemptedAmount -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n),
        )
        expect(finalBalance).toBeLessThan(defaultReserve)
      })

      const testDrain = async (
        initialBalance: bigint,
        customReserve: bigint | undefined,
        queryId: bigint,
        testSetup: TestSetup<TContract>,
      ) => {
        const effectiveReserve = customReserve ?? defaultReserve
        const result = await (
          testSetup.contract as SandboxContract<withdrawable.Interface>
        ).sendWithdraw(testSetup.owner.getSender(), withdrawValue, {
          queryId: queryId,
          destination: testSetup.recipient.address,
          amount: 0n,
          reserve: customReserve,
          drainAllAvailable: true,
        })

        expect(result.transactions).toHaveTransaction({
          from: testSetup.owner.address,
          to: testSetup.contract.address,
          success: true,
          value: withdrawValue,
        })

        const tx = searchTX(result, testSetup.contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(
          initialBalance -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n) -
            effectiveReserve +
            remainingMessageValue(tx),
        )

        const finalBalance = (await testSetup.blockchain.getContract(testSetup.contract.address))
          .balance
        expect(finalBalance).toBe(effectiveReserve)
      }

      /**
       * Test draining all available balance above reserve
       */
      it('should drain all available balance above reserve', async () => {
        const testSetup = await setup()
        const initialBalance = (await testSetup.blockchain.getContract(testSetup.contract.address))
          .balance

        testDrain(initialBalance, undefined, 5n, testSetup)
      })

      /**
       * Test draining all available balance above custom reserve higher than default
       */
      it('should drain all available balance above custom reserve higher than default', async () => {
        const testSetup = await setup()
        const initialBalance = (await testSetup.blockchain.getContract(testSetup.contract.address))
          .balance
        const customReserve = customReserveAboveDefault(initialBalance)

        testDrain(initialBalance, customReserve, 15n, testSetup)
      })

      /**
       * Test draining all available balance above custom reserve lower than default
       */
      it('should drain all available balance above custom reserve lower than default', async () => {
        const testSetup = await setup()
        const initialBalance = (await testSetup.blockchain.getContract(testSetup.contract.address))
          .balance
        const customReserve = customReserveBelowDefault()

        testDrain(initialBalance, customReserve, 16n, testSetup)
      })

      /**
       * Test draining entire balance overwriting reserve
       */
      it('should drain entire balance when overwriting reserve', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 6n,
            destination: recipient.address,
            amount: 0n,
            reserve: toNano('0'), // Disable reserve protection
            drainAllAvailable: true,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: true,
          value: withdrawValue,
        })

        const tx = searchTX(result, contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(
          initialBalance -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n) +
            remainingMessageValue(tx),
        )

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(0n)
      })

      /**
       * Test that invalid requests fail
       */
      it('should fail on invalid request (amount > 0 and drainAllAvailable = true)', async () => {
        const { contract, owner, recipient } = await setup()

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 7n,
            destination: recipient.address,
            amount: toNano('1'),
            reserve: undefined,
            drainAllAvailable: true,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.InvalidRequest,
        })
      })

      /**
       * Test that invalid requests fail
       */
      it('should fail on invalid request (amount = 0 and drainAllAvailable = false)', async () => {
        const { contract, owner, recipient } = await setup()

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 8n,
            destination: recipient.address,
            amount: 0n,
            reserve: undefined,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.InvalidRequest,
        })
      })

      /**
       * Test that withdrawal fails when balance is below reserve and drainAllAvailable is true
       */
      it('should fail when balance is below reserve and trying to drain available', async () => {
        const { blockchain, contract, owner, recipient } = await setup()

        // First, drain most of the balance
        {
          const initialBalance = (await blockchain.getContract(contract.address)).balance
          const withdrawAmount = withdrawHittingReserve(initialBalance, defaultReserve)
          const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
            owner.getSender(),
            withdrawValue,
            {
              queryId: 9n,
              destination: recipient.address,
              amount: withdrawAmount,
              reserve: toNano('0'), // TODO call drain all with custom reserve instead
              drainAllAvailable: false,
            },
          )

          expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: contract.address,
            success: true,
            value: withdrawValue,
          })

          const contractBalance = (await blockchain.getContract(contract.address)).balance
          expect(contractBalance).toBeLessThan(defaultReserve)
          expect(contractBalance).toBeGreaterThan(0n)
        }

        // Now try to drain again - should fail because balance is at or below reserve
        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 10n,
            destination: recipient.address,
            amount: 0n,
            reserve: undefined,
            drainAllAvailable: true,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.LowReserve,
        })
      })

      /**
       * Test withdrawing specific amount with custom reserve higher than default
       */
      it('should withdraw specific amount with custom reserve higher than default', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance
        const customReserve = customReserveAboveDefault(initialBalance)
        const withdrawAmount = withdrawWithoutHittingReserve(initialBalance, customReserve)

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 11n,
            destination: recipient.address,
            amount: withdrawAmount,
            reserve: customReserve,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: true,
          value: withdrawValue,
        })
        const tx = searchTX(result, contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(withdrawAmount + remainingMessageValue(tx))

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(
          initialBalance -
            withdrawAmount -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n),
        )
      })

      /**
       * Test withdrawing specific amount with custom reserve lower than default
       */
      it('should withdraw specific amount with custom reserve lower than default', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance
        const customReserve = customReserveBelowDefault()
        expect(customReserve).toBeLessThan(defaultReserve)
        const withdrawAmount = withdrawLeavingBalanceBetweenReserves(
          initialBalance,
          customReserve,
          defaultReserve,
        )

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 12n,
            destination: recipient.address,
            amount: withdrawAmount,
            reserve: customReserve,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: true,
          value: withdrawValue,
        })
        const tx = searchTX(result, contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(withdrawAmount + remainingMessageValue(tx))

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(
          initialBalance -
            withdrawAmount -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n),
        )
      })

      /**
       * Test that withdrawal respects custom reserve higher than default
       */
      it('should respect custom reserve higher than default when amount would hit it', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const customReserve = customReserveAboveDefault(contractBalance)
        const attemptedAmount = withdrawLeavingBalanceBetweenReserves(
          contractBalance,
          defaultReserve,
          customReserve,
        )
        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 13n,
            destination: recipient.address,
            amount: attemptedAmount,
            reserve: customReserve,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.HitReserve,
        })
      })

      /**
       * Test that withdrawal respects custom reserve lower than default
       */
      it('should respect custom reserve lower than default when amount would hit it', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const customReserve = customReserveBelowDefault()
        expect(customReserve).toBeLessThan(defaultReserve)
        const attemptedAmount = withdrawHittingReserve(contractBalance, customReserve)

        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 14n,
            destination: recipient.address,
            amount: attemptedAmount,
            reserve: customReserve,
            drainAllAvailable: false,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.HitReserve,
        })
      })

      /**
       * Test that withdrawal fails when balance is below custom reserve higher than default
       */
      it('should fail when balance is below custom reserve higher than default and trying to drain', async () => {
        const { blockchain, contract, owner, recipient } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance
        const customReserve = customReserveAboveDefault(initialBalance)

        // First, drain most of the balance
        {
          const withdrawAmount = withdrawHittingReserve(
            (await blockchain.getContract(contract.address)).balance,
            customReserve,
          )
          const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
            owner.getSender(),
            withdrawValue,
            {
              queryId: 17n,
              destination: recipient.address,
              amount: withdrawAmount,
              reserve: toNano('0'), // TODO call drain all with custom reserve instead
              drainAllAvailable: false,
            },
          )

          expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: contract.address,
            success: true,
            value: withdrawValue,
          })

          const contractBalance = (await blockchain.getContract(contract.address)).balance
          expect(contractBalance).toBeLessThan(customReserve)
          expect(contractBalance).toBeGreaterThan(0n)
        }

        // Now try to drain with custom reserve - should fail because balance is below it
        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 18n,
            destination: recipient.address,
            amount: 0n,
            reserve: customReserve,
            drainAllAvailable: true,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: false,
          exitCode: withdrawable.Error.LowReserve,
        })
      })

      /**
       * Test that withdrawal succeeds when balance is above custom reserve lower than default
       */
      it('should succeed draining when balance is below default reserve but above custom lower reserve', async () => {
        const { blockchain, contract, owner, recipient } = await setup()

        const customReserve = customReserveBelowDefault()
        // First, drain to be between custom reserve and default reserve
        {
          const withdrawAmount = withdrawHittingReserve(
            (await blockchain.getContract(contract.address)).balance,
            defaultReserve,
          )
          const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
            owner.getSender(),
            withdrawValue,
            {
              queryId: 19n,
              destination: recipient.address,
              amount: withdrawAmount,
              reserve: toNano('0'), // TODO call drain all with custom reserve instead
              drainAllAvailable: false,
            },
          )

          expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: contract.address,
            success: true,
            value: withdrawValue,
          })
          const tx = searchTX(result, contract)

          const contractBalance = (await blockchain.getContract(contract.address)).balance
          expect(contractBalance).toBeLessThan(defaultReserve)
          expect(contractBalance).toBe(
            customReserve - (tx.description.storagePhase?.storageFeesCollected ?? 0n),
          )
        }

        const balanceBeforeDrain = (await blockchain.getContract(contract.address)).balance

        // Now drain with lower custom reserve - should succeed
        const result = await (contract as SandboxContract<withdrawable.Interface>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 20n,
            destination: recipient.address,
            amount: 0n,
            reserve: customReserve,
            drainAllAvailable: true,
          },
        )

        expect(result.transactions).toHaveTransaction({
          from: owner.address,
          to: contract.address,
          success: true,
          value: withdrawValue,
        })

        const tx = searchTX(result, contract)
        const outMsg = getOutMsg(tx)
        expect(outMsg.info.value.coins).toBe(
          balanceBeforeDrain -
            (tx.description.storagePhase?.storageFeesCollected ?? 0n) -
            customReserve +
            remainingMessageValue(tx),
        )

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(customReserve)
      })
    },
  }

  type InternalMsgTX = BlockchainTransaction & {
    inMessage: Message & {
      info: CommonMessageInfoInternal
    }
    description: TransactionDescriptionGeneric & {
      computePhase: TransactionComputeVm
      actionPhase: TransactionActionPhase
    }
  }

  /// withdrawValue - computePhase.gasFees - actionPhase.totalFwdFees
  function remainingMessageValue(tx) {
    return (
      withdrawValue -
      tx.description.computePhase.gasFees -
      (tx.description.actionPhase.totalFwdFees ?? 0n)
    )
  }

  function searchTX(
    result: SendMessageResult & {
      result: void
    },
    contract: SandboxContract<TContract & withdrawable.Interface>,
  ): InternalMsgTX {
    const tx = result.transactions.find((tx) => {
      return (
        tx.inMessage?.info.type === 'internal' && tx.inMessage.info.dest.equals(contract.address)
      )
    })
    if (!tx) {
      throw new Error('Withdraw transaction not found')
    }
    if (!(tx.description.type === 'generic' && tx.description.computePhase.type === 'vm')) {
      throw new Error('Withdraw transaction not found or failed')
    }
    return tx as InternalMsgTX
  }

  function getOutMsg(tx: InternalMsgTX) {
    const outMsg = tx.outMessages.get(0)
    if (!outMsg) {
      throw new Error('No outMsg found')
    }
    if (outMsg.info.type !== 'internal') {
      throw new Error('OutMsg is not internal')
    }
    return outMsg as Message & { info: CommonMessageInfoInternal }
  }
}
