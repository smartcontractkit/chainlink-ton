import '@ton/test-utils'

import { Address, Cell, Message, beginCell, toNano } from '@ton/core'
import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId } from '../../../src/utils'
import { contractCode } from '../../../wrappers/codeLoader'
import * as namespace from '../../../wrappers/ccip/NameSpace'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tare from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import { ContractCoverageConfig } from '../../coverage/coverage'

type Result = { transactions: BlockchainTransaction[] }

export const RegistryErrors = tar.TokenAdminRegistry.Errors
export const EntryErrors = tare.TokenAdminRegistryEntry.Errors
export const CELL_UNDERFLOW = 9

/** Enough value for any root operation, including a stale entry upgrade round trip. */
export const OPERATION_VALUE = toNano('0.1')

export function createBlockchain(): Promise<Blockchain> {
  return Blockchain.create().then((blockchain) => {
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    return blockchain
  })
}

export async function deployTokenAdminRegistry(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  opt: { code?: Cell } = {},
): Promise<SandboxContract<tar.TokenAdminRegistry>> {
  const registry = blockchain.openContract(
    tar.TokenAdminRegistry.fromStorage(
      {
        // The registry address commits to its storage, so a random id keeps
        // every deployment distinct within a shared sandbox.
        id: generateRandomContractId(),
        ownable: tar.Ownable2Step.create({ owner: owner.address }),
      },
      { overrideContractCode: opt.code ?? (await contractCode.ccip.local('TokenAdminRegistry')) },
    ),
  )
  const result = await registry.sendDeploy(owner.getSender(), toNano('0.1'))
  expect(result.transactions).toHaveTransaction({
    from: owner.address,
    to: registry.address,
    deploy: true,
    success: true,
  })
  return registry
}

/** Deploys a registry and registers a token, returning the resulting entry. */
export async function deployTokenAdminRegistryEntry(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
): Promise<SandboxContract<tare.TokenAdminRegistryEntry>> {
  const fx = await setup(blockchain, owner)
  await registerToken(fx)
  return entryFor(fx)
}

export type Fixture = {
  blockchain: Blockchain
  owner: SandboxContract<TreasuryContract>
  other: SandboxContract<TreasuryContract>
  administrator: SandboxContract<TreasuryContract>
  replacementAdministrator: SandboxContract<TreasuryContract>
  registry: SandboxContract<tar.TokenAdminRegistry>
  deployableCode: Cell
  token: Address
  otherToken: Address
  pool: Address
  replacementPool: Address
}

export async function setup(
  blockchain: Blockchain,
  owner?: SandboxContract<TreasuryContract>,
): Promise<Fixture> {
  owner ??= await blockchain.treasury('owner')
  return {
    blockchain,
    owner,
    other: await blockchain.treasury('other'),
    administrator: await blockchain.treasury('administrator'),
    replacementAdministrator: await blockchain.treasury('replacementAdministrator'),
    registry: await deployTokenAdminRegistry(blockchain, owner),
    deployableCode: await contractCode.ccip.local('Deployable'),
    token: (await blockchain.treasury('token')).address,
    otherToken: (await blockchain.treasury('otherToken')).address,
    pool: (await blockchain.treasury('pool')).address,
    replacementPool: (await blockchain.treasury('replacementPool')).address,
  }
}

export async function coverageConfig(): Promise<ContractCoverageConfig[]> {
  return [
    {
      code: await contractCode.ccip.local('TokenAdminRegistry'),
      name: 'token_admin_registry',
    },
    {
      code: await contractCode.ccip.local('TokenAdminRegistryEntry'),
      name: 'token_admin_registry_entry',
    },
  ]
}

export const tokenInfo = (fx: Fixture, tokenPool: Address | null = fx.pool, token = fx.token) =>
  tar.TokenRegistry_TokenInfo.create({ tokenPool, minterAddress: token, version: 1n })

export const entryAddress = (fx: Fixture, token = fx.token) =>
  namespace.deriveAddress(
    fx.registry.address,
    namespace.CCIPNamespace.TokenRegistry,
    beginCell().storeAddress(token),
    fx.deployableCode,
  )

export const entryFor = (fx: Fixture, token = fx.token) =>
  fx.blockchain.openContract(tare.TokenAdminRegistryEntry.fromAddress(entryAddress(fx, token)))

export const asRoot = (fx: Fixture) => fx.blockchain.sender(fx.registry.address)

export const asEntry = (fx: Fixture, token = fx.token) =>
  fx.blockchain.sender(entryAddress(fx, token))

export async function accountState(fx: Fixture, address = entryAddress(fx)) {
  const state = (await fx.blockchain.getContract(address)).accountState
  if (state?.type !== 'active' || !state.state.code || !state.state.data) {
    throw new Error(`${address} is not active`)
  }
  return { code: state.state.code, data: state.state.data }
}

export async function registerToken(
  fx: Fixture,
  opt: {
    administrator?: Address
    queryId?: bigint
    token?: Address
    /** Answer the entry's TEP-89 query as the token, enabling it. */
    answerWalletQuery?: boolean
  } = {},
) {
  const token = opt.token ?? fx.token
  const result = await fx.registry.sendTokenAdminRegistryRegisterToken(
    fx.owner.getSender(),
    OPERATION_VALUE,
    {
      queryId: opt.queryId ?? 0n,
      tokenAddress: token,
      tokenInfo: tokenInfo(fx, fx.pool, token),
      administrator: opt.administrator ?? fx.administrator.address,
    },
  )
  expect(result.transactions).toHaveTransaction({
    from: fx.owner.address,
    to: fx.registry.address,
    op: tar.TokenAdminRegistry_RegisterToken.PREFIX,
    success: true,
  })
  expect(result.transactions).toHaveTransaction({
    to: entryAddress(fx, token),
    deploy: true,
    success: true,
  })
  if (opt.answerWalletQuery ?? true) {
    await answerWalletQuery(fx, { token })
  }
  return result
}

/** Sends the TEP-89 answer to the entry's registration query, as the token by default. */
export const answerWalletQuery = (
  fx: Fixture,
  opt: { token?: Address; wallet?: Address | null; from?: Address } = {},
) =>
  entryFor(fx, opt.token ?? fx.token).sendResponseWalletAddress(
    fx.blockchain.sender(opt.from ?? opt.token ?? fx.token),
    toNano('0.02'),
    {
      queryId: 0n,
      jettonWalletAddress: opt.wallet === undefined ? fx.other.address : opt.wallet,
      ownerAddress: null,
    },
  )

/** Registers the token and has the proposed administrator accept the role. */
export async function registerAndAccept(fx: Fixture) {
  await registerToken(fx)
  const result = await acceptAdminRole(fx, fx.administrator)
  expectEntrySuccess(fx, result)
}

export const transferAdminRole = (
  fx: Fixture,
  actor: SandboxContract<TreasuryContract>,
  newAdministrator: Address | null,
  queryId = 0n,
  value = OPERATION_VALUE,
) =>
  fx.registry.sendTokenAdminRegistryTransferAdminRole(actor.getSender(), value, {
    queryId,
    tokenAddress: fx.token,
    newAdministrator,
  })

export const acceptAdminRole = (
  fx: Fixture,
  actor: SandboxContract<TreasuryContract>,
  queryId = 0n,
  value = OPERATION_VALUE,
) =>
  fx.registry.sendTokenAdminRegistryAcceptAdminRole(actor.getSender(), value, {
    queryId,
    tokenAddress: fx.token,
  })

export const overridePendingAdministrator = (
  fx: Fixture,
  actor: SandboxContract<TreasuryContract>,
  administrator: Address,
  queryId = 0n,
  value = OPERATION_VALUE,
) =>
  fx.registry.sendTokenAdminRegistryOverridePendingAdministrator(actor.getSender(), value, {
    queryId,
    tokenAddress: fx.token,
    administrator,
  })

export const setPool = (
  fx: Fixture,
  actor: SandboxContract<TreasuryContract>,
  tokenPool: Address | null,
  queryId = 0n,
  value = OPERATION_VALUE,
  transferInitiator: Address | null = null,
) =>
  fx.registry.sendTokenAdminRegistrySetPool(actor.getSender(), value, {
    queryId,
    tokenAddress: fx.token,
    tokenPool,
    transferInitiator,
  })

export function expectEntrySuccess(fx: Fixture, result: Result) {
  expect(result.transactions).toHaveTransaction({
    from: fx.registry.address,
    to: entryAddress(fx),
    success: true,
  })
}

export function expectEntryFailure(fx: Fixture, result: Result, exitCode: number) {
  expect(result.transactions).toHaveTransaction({
    from: fx.registry.address,
    to: entryAddress(fx),
    success: false,
    exitCode,
  })
}

export function expectRootFailure(fx: Fixture, result: Result, from: Address, exitCode: number) {
  expect(result.transactions).toHaveTransaction({
    from,
    to: fx.registry.address,
    success: false,
    exitCode,
  })
}

/** All external events emitted by the registry root under the given topic. */
export function rootEvents(fx: Fixture, result: Result, topic: number) {
  return result.transactions
    .flatMap((tx) => tx.outMessages.values())
    .filter(
      (msg: Message) =>
        msg.info.type === 'external-out' &&
        msg.info.src.equals(fx.registry.address) &&
        msg.info.dest?.value === BigInt(topic),
    )
    .map((msg) => msg.body.beginParse())
}

/** The single external event emitted by the registry root under the given topic. */
export function rootEvent(fx: Fixture, result: Result, topic: number) {
  const events = rootEvents(fx, result, topic)
  expect(events).toHaveLength(1)
  return events[0]
}

function replyTo(fx: Fixture, result: Result, requester: Address) {
  const reply = result.transactions.find(
    (tx) =>
      tx.inMessage?.info.type === 'internal' &&
      tx.inMessage.info.src.equals(fx.registry.address) &&
      tx.inMessage.info.dest.equals(requester),
  )
  if (!reply?.inMessage) {
    throw new Error('TokenAdminRegistry token info reply not found')
  }
  return reply.inMessage.body.beginParse()
}

export function returnedTokenInfo(fx: Fixture, result: Result, requester: Address) {
  return tar.TokenAdminRegistry_TokenInfo.fromSlice(replyTo(fx, result, requester))
}

export function failedTokenInfo(fx: Fixture, result: Result, requester: Address) {
  return tar.TokenAdminRegistry_GetTokenInfoFailed.fromSlice(replyTo(fx, result, requester))
}

export const messageFromRoot = (
  content: tare.TokenAdminRegistryEntry_RootMessage,
  minEntryVersion = 1n,
  queryId = 0n,
) => tare.TokenAdminRegistryEntry_MessageFromRoot.create({ queryId, minEntryVersion, content })
