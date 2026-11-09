import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'

import { CCIPNamespace } from '../../../wrappers/ccip/NameSpace'
import { JettonWallet } from '../../../wrappers/jetton/JettonWallet'
import {
  TokenPool,
  TokenPool_Budget,
  TokenPool_ChainUpdate,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnWithdraw,
  TokenPool_RateLimitConfigPair,
  TokenPool_ReleaseOrMint,
  RateLimiter_Config,
  TokenPool_ReleaseOrMintDelivery,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { CctHarnessContract } from '../harness'
import { vmGasUsed } from '../token/gas'

export type SendResult = { transactions: Array<any> }
export type FlowKind = 'lock' | 'release'

/// A TON balance that the flow must not draw down (the pool plus its custody counterpart).
export type TrackedAccount = {
  label: string
  address: Address
}

/// A token-pool family exposes its deployed pool (standard interface), the local token, the
/// effective on-chain budget, and the accounts whose balance the flow must preserve.
export type TokenPoolGasHandle = {
  pool: SandboxContract<TokenPool>
  localToken: Address
  getWalletAddress: (owner: Address) => Promise<Address>
  readBudget: () => Promise<TokenPool_Budget>
  trackedAccounts: TrackedAccount[]
  assertTokenBudget: (kind: FlowKind, result: SendResult) => Promise<void>
  /// Optional: fund custody/balance before the release flow (e.g. mint to the lockbox).
  fundForRelease?: () => Promise<void>
}

export type TokenPoolGasFixture = {
  name: string
  setup: (
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    recipient: SandboxContract<TreasuryContract>,
  ) => Promise<TokenPoolGasHandle>
}

const REMOTE_CHAIN_SELECTOR = 90000001n
const SOURCE_POOL_ADDRESS = CrossChainAddressCodec.FromBuffer(Buffer.from('source-pool'))
const DEST_TOKEN_ADDRESS = CrossChainAddressCodec.FromBuffer(Buffer.from('dest-token'))

/// Standard per-TP setup: register the remote lane + rate limits so LockOrBurn/ReleaseOrMint admit.
async function configureChain(
  pool: SandboxContract<TokenPool>,
  deployer: SandboxContract<TreasuryContract>,
) {
  await pool.sendTokenPoolApplyChainUpdates(deployer.getSender(), toNano('0.2'), {
    queryId: 1n,
    remoteChainSelectorsToRemove: [],
    chainsToAdd: [
      TokenPool_ChainUpdate.create({
        remoteChainSelector: REMOTE_CHAIN_SELECTOR,
        remotePoolAddresses: [SOURCE_POOL_ADDRESS],
        remoteTokenAddress: DEST_TOKEN_ADDRESS,
        rateLimitConfigs: TokenPool_RateLimitConfigPair.create({
          outbound: RateLimiter_Config.create({
            isEnabled: true,
            capacity: toNano('100'),
            rate: 1n,
          }),
          inbound: RateLimiter_Config.create({
            isEnabled: true,
            capacity: toNano('100'),
            rate: 1n,
          }),
        }),
      }),
    ],
  })
}

/// The caller-provided continuation the pool expects on top of its admission.
const FINALIZATION_VALUE = toNano('0.02')
/// The delivery continuation; the release entrypoint requires `release admission + this`.
const DELIVERY_FORWARD = toNano('0.01')
/// Covers the sender wallet's own transfer cost; the excess returns to the sender.
const WALLET_SEND_BUFFER = toNano('0.05')

export type LockOrBurnResult = {
  admitted: SendResult
  custody: SendResult
}

/// Full LockOrBurn: pool admits with exactly `A + F`, then the deposit account transfers the
/// jettons with the custody forward the pool asked for.
async function lockOrBurn(
  blockchain: Blockchain,
  handle: TokenPoolGasHandle,
  deployer: SandboxContract<TreasuryContract>,
  queryId: bigint,
  jettonAmount: bigint,
): Promise<LockOrBurnResult> {
  const budget = await handle.readBudget()
  const admitted = await handle.pool.sendTokenPoolLockOrBurn(
    deployer.getSender(),
    budget.lockOrBurn.admission + FINALIZATION_VALUE,
    {
      queryId,
      request: TokenPool_LockOrBurnInV1.create({
        transfer: TokenPool_Transfer.create({
          id: queryId,
          details: TokenPool_TransferDetails.create({
            receiver: DEST_TOKEN_ADDRESS,
            remoteChainSelector: REMOTE_CHAIN_SELECTOR,
            originalSender: deployer.address,
            amount: jettonAmount,
            localToken: handle.localToken,
          }),
        }),
      }),
      requestedFinalityConfig: 0n,
      tokenArgs: null,
      replyTo: deployer.address,
      finalizationValue: FINALIZATION_VALUE,
      onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
    },
  )

  const withdrawTx = admitted.transactions
    .map((tx) => tx.inMessage)
    .find(
      (m) =>
        m?.info.type === 'internal' &&
        m.info.src instanceof Address &&
        m.info.src.equals(handle.pool.address) &&
        m.body.beginParse().preloadUint(32) === TokenPool_LockOrBurnWithdraw.PREFIX,
    )
  if (!withdrawTx) throw new Error('missing LockOrBurnWithdraw')
  const withdraw = TokenPool_LockOrBurnWithdraw.fromSlice(withdrawTx.body.beginParse())

  const deployerWallet = blockchain.openContract(
    JettonWallet.createFromAddress(await handle.getWalletAddress(deployer.address)),
  )
  const custody = await deployerWallet.sendTransfer(deployer.getSender(), {
    // Fund the exact custody forward plus the wallet's own transfer cost. The wallet returns the
    // unused remainder to the sender.
    value: withdraw.forwardTonAmount + WALLET_SEND_BUFFER,
    message: {
      queryId: Number(queryId),
      jettonAmount,
      destination: handle.pool.address,
      responseDestination: deployer.address,
      customPayload: null,
      forwardTonAmount: withdraw.forwardTonAmount,
      forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(withdraw.forwardPayload),
    },
  })

  return { admitted, custody }
}

const DELIVERY_NOTIFY_PREFIX = 0x88e0ef3e

function deliveryTo(recipient: Address, notify: Address): TokenPool_ReleaseOrMintDelivery {
  return TokenPool_ReleaseOrMintDelivery.create({
    recipient,
    forwardTonAmount: DELIVERY_FORWARD,
    forwardPayload: beginCell()
      .storeUint(DELIVERY_NOTIFY_PREFIX, 32)
      .storeAddress(notify)
      .endCell(),
  })
}

async function releaseOrMint(
  handle: TokenPoolGasHandle,
  deployer: SandboxContract<TreasuryContract>,
  recipient: SandboxContract<TreasuryContract>,
  queryId: bigint,
  amount: bigint,
): Promise<SendResult> {
  const budget = await handle.readBudget()
  const delivery = deliveryTo(recipient.address, deployer.address)
  return handle.pool.sendTokenPoolReleaseOrMint(
    deployer.getSender(),
    budget.releaseOrMint.admission + delivery.forwardTonAmount,
    {
      queryId,
      request: TokenPool_ReleaseOrMintInV1.create({
        transfer: TokenPool_Transfer.create({
          id: queryId,
          details: TokenPool_TransferDetails.create({
            originalSender: SOURCE_POOL_ADDRESS,
            remoteChainSelector: REMOTE_CHAIN_SELECTOR,
            receiver: recipient.address,
            amount,
            localToken: handle.localToken,
          }),
        }),
        sourcePoolAddress: SOURCE_POOL_ADDRESS,
        sourcePoolData: null,
        offchainTokenData: null,
      }),
      requestedFinalityConfig: 0n,
      replyTo: deployer.address,
      delivery,
    },
  )
}

/// Per-pool gas: the entrypoint is the first transaction addressed to the pool; the continuation
/// max is the most expensive handler the flow drives on the pool (custody/mint continuations).
export function poolHandlerGas(result: SendResult, poolAddress: Address) {
  const txs = result.transactions.filter(
    (tx) =>
      tx.inMessage?.info.type === 'internal' &&
      tx.inMessage.info.dest instanceof Address &&
      tx.inMessage.info.dest.equals(poolAddress),
  )
  if (txs.length === 0) throw new Error(`no transaction addressed to pool ${poolAddress}`)
  return {
    entrypointGas: vmGasUsed(txs[0]),
    continuationMaxGas: txs.map((tx) => vmGasUsed(tx)).reduce((a, b) => (a > b ? a : b), 0n),
  }
}

/// Full TON cost of a transaction: compute/storage/action fees plus the forward fees of every
/// outgoing message (including external-out events, which `totalFwdFees` covers).
export function transactionFee(tx: any): bigint {
  const forward = tx.description?.actionPhase?.totalFwdFees ?? 0n
  return tx.totalFees.coins + forward
}

function internalMessageKey(info: any): string | null {
  if (info?.type !== 'internal' || !info.src || !info.dest) return null
  return `${info.createdLt?.toString?.()}:${info.src.toString()}:${info.dest.toString()}`
}

/// All transactions reachable from `root` by following internal out messages. This is the subtree
/// whose fees the admitted value has to pay (the pool and every custody/finalization hop).
export function subtreeTransactions(result: SendResult, root: any): any[] {
  const byMessage = new Map<string, any>()
  for (const tx of result.transactions) {
    const key = internalMessageKey(tx.inMessage?.info)
    if (key && !byMessage.has(key)) byMessage.set(key, tx)
  }

  const seen = new Set<any>()
  const queue: any[] = [root]
  const subtree: any[] = []
  while (queue.length > 0) {
    const tx = queue.shift()
    if (!tx || seen.has(tx)) continue
    seen.add(tx)
    subtree.push(tx)
    for (const message of tx.outMessages?.values?.() ?? []) {
      const key = internalMessageKey(message.info)
      const child = key ? byMessage.get(key) : undefined
      if (child) queue.push(child)
    }
  }
  return subtree
}

export function subtreeFee(result: SendResult, root: any): bigint {
  return subtreeTransactions(result, root).reduce((sum, tx) => sum + transactionFee(tx), 0n)
}

export function findTxTo(result: SendResult, destination: Address, op: number): any {
  const tx = result.transactions.find(
    (candidate) =>
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest instanceof Address &&
      candidate.inMessage.info.dest.equals(destination) &&
      bodyOp(candidate) === op,
  )
  if (!tx) throw new Error(`missing transaction to ${destination} with op ${op}`)
  return tx
}

async function balancesOf(
  blockchain: Blockchain,
  accounts: TrackedAccount[],
): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>()
  for (const account of accounts) {
    balances.set(account.label, (await blockchain.getContract(account.address)).balance)
  }
  return balances
}

export function internalTxTo(result: SendResult, destination: Address) {
  const tx = result.transactions.find(
    (candidate) =>
      candidate.inMessage?.info.type === 'internal' &&
      candidate.inMessage.info.dest instanceof Address &&
      candidate.inMessage.info.dest.equals(destination),
  )
  if (!tx) throw new Error(`missing internal transaction to ${destination}`)
  return tx
}

const INTERNAL_TRANSFER_OP = 0x178d4519
const ASK_TO_TRANSFER_OP = 0x0f8a7ea5

function bodyOp(tx: any): number | null {
  const body = tx.inMessage?.body
  if (!body) return null
  const slice = body.beginParse()
  return slice.remainingBits >= 32 ? slice.preloadUint(32) : null
}

/// Locates a token-hop by its `InternalTransferStep`: the receiving wallet is the destination of
/// that message, and the sender is the account that produced it. The sender is a wallet on the
/// transfer/lock paths (`AskToTransfer`) or the minter on the mint path (`MintNewJettons`).
export function walletHopByInternalTransfer(result: SendResult): { send: any; receive: any } {
  const receive = result.transactions.find(
    (tx) => tx.inMessage?.info.type === 'internal' && bodyOp(tx) === INTERNAL_TRANSFER_OP,
  )
  if (!receive) throw new Error('no InternalTransferStep transaction in result')
  const sender: Address = receive.inMessage.info.src
  const addressedToSender = result.transactions.filter(
    (tx) =>
      tx.inMessage?.info.type === 'internal' &&
      tx.inMessage.info.dest instanceof Address &&
      tx.inMessage.info.dest.equals(sender),
  )
  const send =
    addressedToSender.find((tx) => bodyOp(tx) === ASK_TO_TRANSFER_OP) ?? addressedToSender[0]
  if (!send) throw new Error('no sender transaction in result')
  return { send, receive }
}

/// The pool funds a wallet hop with `jettonTransferFee`, using the reference model for CCT and the
/// doubled model for other wallets. Assert that fee covers the
/// hop's measured fees; this catches a change to the fee model itself, not just the token
/// constants it is built from.
export async function assertWalletFeeCoversHop(
  cct: CctHarnessContract,
  hop: { send: any; receive: any },
  generic: boolean,
): Promise<void> {
  const fwdFee: bigint = hop.receive.inMessage.info.forwardFee
  const fee = await cct.getJettonTransferFee(fwdFee, true, generic)
  const actual = hop.send.totalFees.coins + hop.receive.totalFees.coins
  expect(fee).toBeGreaterThanOrEqual(actual)
}

/// Drives the standard token-pool operations (a full LockOrBurn and a full ReleaseOrMint) against a
/// family fixture and asserts the on-chain floors and token-hop budgets cover the measured gas.
export function runTokenPoolGasCalibration(fixture: TokenPoolGasFixture) {
  describe(`${fixture.name} token-pool gas calibration`, () => {
    let blockchain: Blockchain
    let deployer: SandboxContract<TreasuryContract>
    let recipient: SandboxContract<TreasuryContract>
    let handle: TokenPoolGasHandle

    beforeEach(async () => {
      blockchain = await Blockchain.create()
      blockchain.now = Math.floor(Date.now() / 1000)
      deployer = await blockchain.treasury('deployer')
      recipient = await blockchain.treasury('recipient')
      handle = await fixture.setup(blockchain, deployer, recipient)
      await configureChain(handle.pool, deployer)
    })

    // The budgets are empirically ~5x the measured gas. Assert the full TON fee (not just compute
    // gas) fits with that margin, so an underfunded floor cannot pass. Fees are
    // `totalFees + totalFwdFees`: compute/storage/action plus every outgoing forward fee,
    // including external-out events.
    const BUDGET_MARGIN = 5n

    function expectPreservedBalances(before: Map<string, bigint>, after: Map<string, bigint>) {
      for (const account of handle.trackedAccounts) {
        expect(after.get(account.label)).toBeGreaterThanOrEqual(before.get(account.label)!)
      }
    }

    it('LockOrBurn: exact A + F funds the full lock flow', async () => {
      const budget = await handle.readBudget()
      const before = await balancesOf(blockchain, handle.trackedAccounts)
      const { admitted, custody } = await lockOrBurn(blockchain, handle, deployer, 1n, toNano('8'))

      const entryTx = findTxTo(admitted, handle.pool.address, TokenPool_LockOrBurn.PREFIX)
      const admissionFee = subtreeFee(admitted, entryTx)
      const custodyFee = custody.transactions.reduce((sum, tx) => sum + transactionFee(tx), 0n)
      const totalFee = admissionFee + custodyFee
      const { entrypointGas } = poolHandlerGas(admitted, handle.pool.address)
      const { continuationMaxGas } = poolHandlerGas(custody, handle.pool.address)

      console.table([
        {
          operation: `${fixture.name}: LockOrBurn admission`,
          gasUsed: entrypointGas.toString(),
          feeNton: admissionFee.toString(),
          gate: 'A',
          gateNton: budget.lockOrBurn.admission.toString(),
        },
        {
          operation: `${fixture.name}: custody continuation`,
          gasUsed: continuationMaxGas.toString(),
          feeNton: custodyFee.toString(),
          gate: 'S',
          gateNton: budget.lockOrBurn.safety.toString(),
        },
        {
          operation: `${fixture.name}: LockOrBurn total`,
          gasUsed: '-',
          feeNton: totalFee.toString(),
          gate: 'A (5x)',
          gateNton: budget.lockOrBurn.admission.toString(),
        },
      ])

      expect(totalFee * BUDGET_MARGIN).toBeLessThanOrEqual(budget.lockOrBurn.admission)
      expect(custodyFee * BUDGET_MARGIN).toBeLessThanOrEqual(budget.lockOrBurn.safety)
      expectPreservedBalances(before, await balancesOf(blockchain, handle.trackedAccounts))
      await handle.assertTokenBudget('lock', custody)
    })

    it('ReleaseOrMint: exact A + D funds the full release flow', async () => {
      const budget = await handle.readBudget()
      await handle.fundForRelease?.()
      const before = await balancesOf(blockchain, handle.trackedAccounts)
      const result = await releaseOrMint(handle, deployer, recipient, 2n, toNano('1'))

      const entryTx = findTxTo(result, handle.pool.address, TokenPool_ReleaseOrMint.PREFIX)
      const flowFee = subtreeFee(result, entryTx)
      const { entrypointGas, continuationMaxGas } = poolHandlerGas(result, handle.pool.address)

      console.table([
        {
          operation: `${fixture.name}: ReleaseOrMint flow`,
          gasUsed: entrypointGas.toString(),
          feeNton: flowFee.toString(),
          gate: 'A (5x)',
          gateNton: budget.releaseOrMint.admission.toString(),
        },
        {
          operation: `${fixture.name}: release continuation`,
          gasUsed: continuationMaxGas.toString(),
          feeNton: '-',
          gate: 'S (gas only)',
          gateNton: budget.releaseOrMint.safety.toString(),
        },
      ])

      expect(flowFee * BUDGET_MARGIN).toBeLessThanOrEqual(budget.releaseOrMint.admission)
      expectPreservedBalances(before, await balancesOf(blockchain, handle.trackedAccounts))
      await handle.assertTokenBudget('release', result)
    })
  })
}
