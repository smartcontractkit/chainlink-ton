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
import { Contract, ContractProvider } from '@ton/core'
import '@ton/test-utils'
import * as withdrawable from '../../../wrappers/libraries/funding/Withdrawable'

/**
 * Configuration for testing withdrawable functionality.
 */
export type WithdrawableTestConfig<TContract> = {
  /** Function to get the contract code */
  getCode: () => Promise<Cell>
  /** Constructor for the contract */
  ContractConstructor: new (address: Address, init?: { code: Cell; data: Cell }) => TContract
}

/**
 * Contract interface that must be implemented by withdrawable contracts for testing.
 */
export interface WithdrawableContract extends withdrawable.Withdrawable {}

interface TestSetup<TContract> {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  nonOwner: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  contract: SandboxContract<TContract & WithdrawableContract>
  code: Cell
}

/**
 * Creates a reusable test suite for testing withdrawable functionality.
 *
 * @param config Configuration for the withdrawable tests
 * @param setupContract Function to deploy and setup the contract
 * @returns An object with test functions
 *
 * @example
 * ```typescript
 * const withdrawableSpec = newWithdrawableSpec(
 *   {
 *     getCode: () => WithdrawableWallet.code(),
 *     ContractConstructor: WithdrawableWallet,
 *     withdrawValue: toNano('0.05'),
 *     reserve: toNano('1'),
 *   },
 *   async (blockchain, owner) => {
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
 * )
 *
 * describe('WithdrawableWallet Tests', () => {
 *   withdrawableSpec.run()
 * })
 * ```
 */
export function newWithdrawableSpec<TContract extends WithdrawableContract>(
  config: WithdrawableTestConfig<TContract>,
  setupContract: (
    blockchain: Blockchain,
    owner: SandboxContract<TreasuryContract>,
  ) => Promise<SandboxContract<TContract>>,
) {
  const withdrawValue = toNano('0.05')
  var reserve: bigint
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
    const contract = await setupContract(blockchain, owner)
    const balance = (await blockchain.getContract(contract.address)).balance
    reserve = await (contract as SandboxContract<WithdrawableContract>).getReserve()
    if (balance < reserve + toNano('10')) {
      const funder = await blockchain.treasury('funder')
      const res = await funder.send({
        value: toNano('10'),
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

  return {
    run: () => {
      /**
       * Test that the contract can withdraw a specific amount
       */
      it('should withdraw specific amount', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance
        const withdrawAmount = (initialBalance - reserve) / 2n // Withdraw half of available above reserve to ensure success

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 1n,
            destination: recipient.address,
            amount: withdrawAmount,
            force: false,
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

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 2n,
            destination: recipient.address,
            amount: tooMuchAmount,
            force: false,
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
       * Test that withdrawal respects reserve when force is false
       */
      it('should respect reserve when force is false', async () => {
        const { contract, owner, recipient, blockchain } = await setup()
        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const attemptedAmount = contractBalance - reserve / 2n // Between balance and reserve

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 3n,
            destination: recipient.address,
            amount: attemptedAmount,
            force: false,
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
       * Test that withdrawal can bypass reserve when force is true
       */
      it('should bypass reserve when force is true', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const contractBalance = (await blockchain.getContract(contract.address)).balance
        const attemptedAmount = contractBalance - reserve / 2n // Between balance and reserve

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 4n,
            destination: recipient.address,
            amount: attemptedAmount,
            force: true,
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
        expect(finalBalance).toBeLessThan(reserve)
      })

      /**
       * Test draining all available balance above reserve
       */
      it('should drain all available balance above reserve', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 5n,
            destination: recipient.address,
            amount: 0n,
            force: false,
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
        expect(outMsg.info.value.coins).toBe(initialBalance - reserve + remainingMessageValue(tx))

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        // Contract should have the reserve amount left
        expect(finalBalance).toBe(
          reserve - (tx.description.storagePhase?.storageFeesCollected ?? 0n),
        )
      })

      /**
       * Test draining entire balance when force is true
       */
      it('should drain entire balance when force and drainAllAvailable are true', async () => {
        const { contract, owner, recipient, blockchain } = await setup()

        const initialBalance = (await blockchain.getContract(contract.address)).balance

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 6n,
            destination: recipient.address,
            amount: 0n,
            force: true,
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
        expect(outMsg.info.value.coins).toBe(initialBalance + remainingMessageValue(tx))

        const finalBalance = (await blockchain.getContract(contract.address)).balance
        expect(finalBalance).toBe(0n)
      })

      /**
       * Test that invalid requests fail
       */
      it('should fail on invalid request (amount > 0 and drainAllAvailable = true)', async () => {
        const { contract, owner, recipient } = await setup()

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 7n,
            destination: recipient.address,
            amount: toNano('1'),
            force: false,
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

        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 8n,
            destination: recipient.address,
            amount: 0n,
            force: false,
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
          const withdrawAmount =
            (await blockchain.getContract(contract.address)).balance - reserve / 2n // Leave half the reserve
          const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
            owner.getSender(),
            withdrawValue,
            {
              queryId: 9n,
              destination: recipient.address,
              amount: withdrawAmount,
              force: true,
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
          expect(contractBalance).toBeLessThan(reserve)
          expect(contractBalance).toBeGreaterThan(0n)
        }

        // Now try to drain again - should fail because balance is at or below reserve
        const result = await (contract as SandboxContract<WithdrawableContract>).sendWithdraw(
          owner.getSender(),
          withdrawValue,
          {
            queryId: 10n,
            destination: recipient.address,
            amount: 0n,
            force: false,
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
    contract: SandboxContract<TContract & WithdrawableContract>,
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
