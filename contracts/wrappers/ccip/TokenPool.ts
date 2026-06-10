import {
  Address,
  beginCell,
  Builder,
  Cell,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import * as ownable2step from '../libraries/access/Ownable2Step'
import { asSnakedCell } from '../../src/utils'

export const opcodes = {
  in: {
    applyChainUpdates: 0xdc0b6ff5,
    addRemotePool: 0x5fd2c8b6,
    removeRemotePool: 0xdbf0a2df,
    setDynamicConfig: 0x4eea060b,
    setAllowedFinalityConfig: 0x29b46fc6,
    setRateLimitConfig: 0x3a028da2,
    applyTokenTransferFeeConfigUpdates: 0x10c4b4a1,
    updateRampAccess: 0x7a9c4aa5,
    updateCursedSubjects: 0x823dadf2,
    releaseOrMint: 0x7d0ffd89,
  },
  payload: {
    lockOrBurn: 0x1161516e,
  },
  out: {
    lockOrBurnResponse: 0x19e65bea,
    releaseOrMintResponse: 0x7ec43aee,
    releaseOrMintFailure: 0x41a1702b,
  },
}

export type CrossChainAddress = Cell

export type JettonClientConfig = {
  masterAddress: Address
  jettonWalletCode: Cell
}

export type TokenPoolConfig = {
  owner: Address
  token: Address
  tokenDecimals: number
  rmnProxy: Address
  router: Address
}

export type TokenPoolJettonConfig = TokenPoolConfig & {
  jettonClient: JettonClientConfig
}

export type RateLimitConfig = {
  isEnabled: boolean
  capacity: bigint
  rate: bigint
}

export type ChainUpdate = {
  remoteChainSelector: bigint
  remotePoolAddresses: CrossChainAddress[]
  remoteTokenAddress: CrossChainAddress
  outboundRateLimiterConfig: RateLimitConfig
  inboundRateLimiterConfig: RateLimitConfig
}

export type RampAccess = {
  remoteChainSelector: bigint
  onRamp: Address | null
  offRamp: Address | null
}

export type LockOrBurnInV1 = {
  receiver: CrossChainAddress
  remoteChainSelector: bigint
  originalSender: Address
  amount: bigint
  localToken: Address
}

export type LockOrBurnPayload = {
  queryId: bigint
  request: LockOrBurnInV1
  requestedFinalityConfig: number
  tokenArgs: Cell | null
  replyTo: Address | null
}

export type ReleaseOrMintInV1 = {
  originalSender: CrossChainAddress
  remoteChainSelector: bigint
  receiver: Address
  sourceDenominatedAmount: bigint
  localToken: Address
  sourcePoolAddress: CrossChainAddress
  sourcePoolData: Cell | null
  offchainTokenData: Cell | null
}

export type TokenPoolRateLimitConfigArgs = {
  remoteChainSelector: bigint
  fastFinality: boolean
  outboundRateLimiterConfig: RateLimitConfig
  inboundRateLimiterConfig: RateLimitConfig
}

export const codec = {
  crossChainAddressFromBuffer(data: Buffer): Cell {
    return beginCell().storeUint(data.length, 8).storeBuffer(data).endCell()
  },

  rateLimitConfig: {
    encode(data: RateLimitConfig): Builder {
      return beginCell()
        .storeBit(data.isEnabled)
        .storeUint(data.capacity, 128)
        .storeUint(data.rate, 128)
    },
  },

  lockOrBurnInV1: {
    encode(data: LockOrBurnInV1): Builder {
      return beginCell()
        .storeRef(data.receiver)
        .storeUint(data.remoteChainSelector, 64)
        .storeAddress(data.originalSender)
        .storeUint(data.amount, 256)
        .storeAddress(data.localToken)
    },
  },

  releaseOrMintInV1: {
    encode(data: ReleaseOrMintInV1): Builder {
      return beginCell()
        .storeRef(data.originalSender)
        .storeUint(data.remoteChainSelector, 64)
        .storeAddress(data.receiver)
        .storeUint(data.sourceDenominatedAmount, 256)
        .storeAddress(data.localToken)
        .storeRef(data.sourcePoolAddress)
        .storeMaybeRef(data.sourcePoolData)
        .storeMaybeRef(data.offchainTokenData)
    },
  },

  lockOrBurnPayload: {
    encode(data: LockOrBurnPayload): Builder {
      return beginCell()
        .storeUint(opcodes.payload.lockOrBurn, 32)
        .storeUint(data.queryId, 64)
        .storeRef(codec.lockOrBurnInV1.encode(data.request).endCell())
        .storeUint(data.requestedFinalityConfig, 32)
        .storeMaybeRef(data.tokenArgs)
        .storeAddress(data.replyTo)
    },
  },

  releaseOrMintResponse: {
    load(src: Slice): { queryId: bigint; destinationAmount: bigint } {
      const op = src.loadUint(32)
      if (op !== opcodes.out.releaseOrMintResponse) {
        throw new Error('Unexpected opcode: ' + op)
      }
      const queryId = src.loadUintBig(64)
      const out = src.loadRef().beginParse()
      return {
        queryId,
        destinationAmount: out.loadUintBig(256),
      }
    },
  },

  releaseOrMintFailure: {
    load(src: Slice): { queryId: bigint; errorCode: number } {
      const op = src.loadUint(32)
      if (op !== opcodes.out.releaseOrMintFailure) {
        throw new Error('Unexpected opcode: ' + op)
      }
      return {
        queryId: src.loadUintBig(64),
        errorCode: src.loadUint(16),
      }
    },
  },

  lockOrBurnResponse: {
    load(src: Slice): { queryId: bigint; destinationAmount: bigint } {
      const op = src.loadUint(32)
      if (op !== opcodes.out.lockOrBurnResponse) {
        throw new Error('Unexpected opcode: ' + op)
      }
      const queryId = src.loadUintBig(64)
      const out = src.loadRef().beginParse()
      return {
        queryId,
        destinationAmount: out.loadUintBig(256),
      }
    },
  },
}

export function createTokenPoolData(config: TokenPoolConfig): Cell {
  const dynamicConfig = beginCell()
    .storeAddress(config.router)
    .storeAddress(null)
    .storeAddress(null)
    .endCell()

  const adminConfig = beginCell()
    .storeRef(
      ownable2step.builder.data.traitData
        .encode({
          owner: config.owner,
          pendingOwner: null,
        })
        .asCell(),
    )
    .storeAddress(config.rmnProxy)
    .storeRef(dynamicConfig)
    .storeUint(0, 32)
    .endCell()

  return beginCell()
    .storeRef(adminConfig)
    .storeRef(
      beginCell()
        .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()))
        .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()))
        .storeDict(Dictionary.empty())
        .endCell(),
    )
    .storeAddress(config.token)
    .storeUint(config.tokenDecimals, 8)
    .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()))
    .storeDict(Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()))
    .endCell()
}

export function createJettonClientData(config: JettonClientConfig): Cell {
  return beginCell().storeAddress(config.masterAddress).storeRef(config.jettonWalletCode).endCell()
}

export async function sendApplyChainUpdates(
  provider: ContractProvider,
  via: Sender,
  value: bigint,
  body: { queryId: bigint; remove: bigint[]; add: ChainUpdate[] },
) {
  await provider.internal(via, {
    value,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    body: beginCell()
      .storeUint(opcodes.in.applyChainUpdates, 32)
      .storeUint(body.queryId, 64)
      .storeRef(asSnakeUint64(body.remove))
      .storeRef(asSnakeChainUpdates(body.add))
      .endCell(),
  })
}

export async function sendUpdateRampAccess(
  provider: ContractProvider,
  via: Sender,
  value: bigint,
  body: { queryId: bigint; updates: RampAccess[] },
) {
  await provider.internal(via, {
    value,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    body: beginCell()
      .storeUint(opcodes.in.updateRampAccess, 32)
      .storeUint(body.queryId, 64)
      .storeRef(asSnakeRampAccess(body.updates))
      .endCell(),
  })
}

export async function sendUpdateCursedSubjects(
  provider: ContractProvider,
  via: Sender,
  value: bigint,
  body: { queryId: bigint; cursedSubjects: bigint[] },
) {
  const dict = Dictionary.empty(Dictionary.Keys.BigInt(128), Dictionary.Values.Bool())
  body.cursedSubjects.forEach((subject) => dict.set(subject, true))
  await provider.internal(via, {
    value,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    body: beginCell()
      .storeUint(opcodes.in.updateCursedSubjects, 32)
      .storeUint(body.queryId, 64)
      .storeDict(dict)
      .endCell(),
  })
}

export async function sendReleaseOrMint(
  provider: ContractProvider,
  via: Sender,
  value: bigint,
  body: {
    queryId: bigint
    request: ReleaseOrMintInV1
    requestedFinalityConfig?: number
    replyTo?: Address | null
  },
) {
  await provider.internal(via, {
    value,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    body: beginCell()
      .storeUint(opcodes.in.releaseOrMint, 32)
      .storeUint(body.queryId, 64)
      .storeRef(codec.releaseOrMintInV1.encode(body.request).endCell())
      .storeUint(body.requestedFinalityConfig ?? 0, 32)
      .storeAddress(body.replyTo ?? null)
      .endCell(),
  })
}

function asSnakeUint64(items: bigint[]): Cell {
  return asSnakedCell(items, (item) => beginCell().storeUint(item, 64))
}

function asSnakeCrossChainAddresses(items: Cell[]): Cell {
  return asSnakedCell(items, (item) => beginCell().storeSlice(item.beginParse()))
}

function asSnakeChainUpdates(items: ChainUpdate[]): Cell {
  return asSnakedCell(items, (item) =>
    beginCell()
      .storeUint(item.remoteChainSelector, 64)
      .storeRef(asSnakeCrossChainAddresses(item.remotePoolAddresses))
      .storeRef(item.remoteTokenAddress)
      .storeRef(
        beginCell()
          .storeRef(codec.rateLimitConfig.encode(item.outboundRateLimiterConfig).endCell())
          .storeRef(codec.rateLimitConfig.encode(item.inboundRateLimiterConfig).endCell())
          .endCell(),
      ),
  )
}

function asSnakeRampAccess(items: RampAccess[]): Cell {
  return asSnakedCell(items, (item) =>
    beginCell()
      .storeUint(item.remoteChainSelector, 64)
      .storeAddress(item.onRamp)
      .storeAddress(item.offRamp),
  )
}
