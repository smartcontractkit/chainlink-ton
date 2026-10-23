import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'

import { CCIPNamespace } from '../../../wrappers/ccip/NameSpace'
import { JettonWallet } from '../../../wrappers/jetton/JettonWallet'
import {
  TokenPool,
  TokenPool_ChainUpdate,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnWithdraw,
  TokenPool_RateLimitConfigPair,
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

/// The on-chain admission floors a pool entrypoint/continuation must fit under.
export type TokenPoolBudget = {
  admissionGasUnits: number
  minValueGasUnits: number
}

/// A token-pool family exposes its deployed pool (standard interface), the local token and the
/// family-specific budget assertion. Deploy + chain config + the two standard flows are shared.
export type TokenPoolGasHandle = {
  pool: SandboxContract<TokenPool>
  localToken: Address
  getWalletAddress: (owner: Address) => Promise<Address>
  readBudget: () => Promise<TokenPoolBudget>
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

/// Full LockOrBurn: pool admits and returns a withdraw, then the user transfers the jettons back
/// with the pool's forward payload, driving the custody/burn/lock continuation.
async function lockOrBurn(
  blockchain: Blockchain,
  handle: TokenPoolGasHandle,
  deployer: SandboxContract<TreasuryContract>,
  queryId: bigint,
  jettonAmount: bigint,
): Promise<SendResult> {
  const admitted = await handle.pool.sendTokenPoolLockOrBurn(deployer.getSender(), toNano('1'), {
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
    failureValue: toNano('0.02'),
    onRampNamespaces: new Set([BigInt(CCIPNamespace.OnRampAccount)]),
  })

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
  const forwardPayload = TokenPool_LockOrBurnWithdraw.fromSlice(
    withdrawTx.body.beginParse(),
  ).forwardPayload

  const deployerWallet = blockchain.openContract(
    JettonWallet.createFromAddress(await handle.getWalletAddress(deployer.address)),
  )
  return deployerWallet.sendTransfer(deployer.getSender(), {
    value: toNano('0.5') + toNano('2'),
    message: {
      queryId: Number(queryId),
      jettonAmount,
      destination: handle.pool.address,
      responseDestination: deployer.address,
      customPayload: null,
      forwardTonAmount: toNano('0.5'),
      forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
    },
  })
}

const DELIVERY_NOTIFY_PREFIX = 0x88e0ef3e

function deliveryTo(recipient: Address, notify: Address): TokenPool_ReleaseOrMintDelivery {
  return TokenPool_ReleaseOrMintDelivery.create({
    recipient,
    forwardTonAmount: toNano('0.01'),
    forwardPayload: beginCell()
      .storeUint(DELIVERY_NOTIFY_PREFIX, 32)
      .storeAddress(notify)
      .endCell(),
  })
}

function releaseOrMint(
  handle: TokenPoolGasHandle,
  deployer: SandboxContract<TreasuryContract>,
  recipient: SandboxContract<TreasuryContract>,
  queryId: bigint,
  amount: bigint,
): Promise<SendResult> {
  return handle.pool.sendTokenPoolReleaseOrMint(deployer.getSender(), toNano('0.6'), {
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
    delivery: deliveryTo(recipient.address, deployer.address),
  })
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

/// The pool funds a wallet hop with `JettonWalletFees.transferFee(fwdFee, hasForward)`, using the
/// reference model for CCT and the doubled model for other wallets. Assert that fee covers the
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

    it('LockOrBurn stays within the admission floor and token-hop budget', async () => {
      const budget = await handle.readBudget()
      const result = await lockOrBurn(blockchain, handle, deployer, 1n, toNano('8'))
      const { entrypointGas, continuationMaxGas } = poolHandlerGas(result, handle.pool.address)

      console.table([
        { operation: 'pool LockOrBurn entrypoint', gasUsed: entrypointGas },
        { operation: 'pool continuation (max handler tx)', gasUsed: continuationMaxGas },
      ])

      expect(entrypointGas).toBeLessThanOrEqual(BigInt(budget.admissionGasUnits))
      expect(continuationMaxGas).toBeLessThanOrEqual(BigInt(budget.minValueGasUnits))
      await handle.assertTokenBudget('lock', result)
    })

    it('ReleaseOrMint stays within the admission floor and token-hop budget', async () => {
      const budget = await handle.readBudget()
      await handle.fundForRelease?.()
      const result = await releaseOrMint(handle, deployer, recipient, 2n, toNano('1'))
      const { entrypointGas, continuationMaxGas } = poolHandlerGas(result, handle.pool.address)

      console.table([
        { operation: 'pool ReleaseOrMint entrypoint', gasUsed: entrypointGas },
        { operation: 'pool continuation (max handler tx)', gasUsed: continuationMaxGas },
      ])

      expect(entrypointGas).toBeLessThanOrEqual(BigInt(budget.admissionGasUnits))
      expect(continuationMaxGas).toBeLessThanOrEqual(BigInt(budget.minValueGasUnits))
      await handle.assertTokenBudget('release', result)
    })
  })
}
