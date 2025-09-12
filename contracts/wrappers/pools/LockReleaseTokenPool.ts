import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { crc32 } from 'zlib'
import { CellCodec } from '../utils'
import { asSnakeData, fromSnakeData, ZERO_ADDRESS } from '../../src/utils'
import * as ownable2step from '../libraries/access/Ownable2Step'
import { CrossChainAddress } from '../ccip/OffRamp'
import * as jetton from '../examples/jetton'
import { loadDict, loadMap } from '../../src/utils/dict'
import { Data, RemoteChainConfig } from './TokenPools'
import { tokenPool } from '.'

// --- Message types following the .tolk patterns ---

// @dev Gets rebalancer address
export type GetRebalancer = {
  queryId: bigint
}

// @dev Sets the rebalancer address.
export type SetRebalancer = {
  queryId: bigint
  rebalancer: Address
}

// @dev Adds liquidity to the pool.
export type ProvideLiquidity = {
  queryId: bigint
  amount: bigint
}

// @dev Removes liquidity from the pool.
export type WithdrawLiquidity = {
  queryId: bigint
  amount: bigint
}

// @dev Transfer liquidity from an older version of the pool.
export type TransferLiquidity = {
  queryId: bigint
  from: Address
  amount: bigint
}

// @dev Get the router address
export type GetRouter = {
  queryId: bigint
}

// @dev Set the router address
export type SetRouter = {
  queryId: bigint
  newRouter: Address
}

// @dev Check if token is supported
export type IsSupportedToken = {
  queryId: bigint
  token: Address
}

// @dev Get the token managed by this pool
export type GetToken = {
  queryId: bigint
}

// @dev Get RMN proxy address
export type GetRmnProxy = {
  queryId: bigint
}

// @dev Lock or burn tokens - simplified for now
export type LockOrBurn = {
  queryId: bigint
  // We'll add the full Pool_LockOrBurnInV1 structure when needed
  receiver: Cell // encoded receiver address
  remoteChainSelector: bigint
  originalSender: Address
  amount: bigint
  localToken: Address
}

// @dev Release or mint tokens - simplified for now
export type ReleaseOrMint = {
  queryId: bigint
  // We'll add the full Pool_ReleaseOrMintInV1 structure when needed
  originalSender: Cell // encoded original sender
  remoteChainSelector: bigint
  receiver: Address
  sourceDenominatedAmount: bigint
  localToken: Address
}

// @dev Union of all input messages
export type InMessage =
  | GetRebalancer
  | SetRebalancer
  | ProvideLiquidity
  | WithdrawLiquidity
  | TransferLiquidity
  | GetRouter
  | SetRouter
  | IsSupportedToken
  | GetToken
  | GetRmnProxy
  | LockOrBurn
  | ReleaseOrMint

// --- Response types ---

export type GetRebalancerResponse = {
  queryId: bigint
  rebalancer: Address
}

export type GetRouterResponse = {
  queryId: bigint
  router: Address
}

export type GetTokenResponse = {
  queryId: bigint
  token: Address
}

export type GetRmnProxyResponse = {
  queryId: bigint
  rmnProxy: Address
}

export type IsSupportedTokenResponse = {
  queryId: bigint
  isSupported: boolean
}

// Contract storage data
export type ContractData = {
  /// ID allows multiple independent instances
  id: number // uint32

  /// Ownable trait data
  ownable: ownable2step.Data

  /// The rebalancer address
  rebalancer: Address | null

  /// TokenPoolData
  tokenPoolData: Data
}

// --- Error codes from .tolk files ---
export enum Error {
  INSUFFICIENT_LIQUIDITY = 1001,
  // TokenPool errors
  CALLER_IS_NOT_A_RAMP_ON_ROUTER = 1001,
  ZERO_ADDRESS_INVALID = 1002,
  SENDER_NOT_ALLOWED = 1003,
  ALLOW_LIST_NOT_ENABLED = 1004,
  NON_EXISTENT_CHAIN = 1005,
  CHAIN_NOT_ALLOWED = 1006,
  CURSED_BY_RMN = 1007,
  CHAIN_ALREADY_EXISTS = 1008,
  INVALID_SOURCE_POOL_ADDRESS = 1009,
  INVALID_TOKEN = 1010,
  UNAUTHORIZED = 1011,
  POOL_ALREADY_ADDED = 1012,
  INVALID_REMOTE_POOL_FOR_CHAIN = 1013,
  INVALID_REMOTE_CHAIN_DECIMALS = 1014,
  MISMATCHED_ARRAY_LENGTHS = 1015,
  OVERFLOW_DETECTED = 1016,
  INVALID_DECIMAL_ARGS = 1017,
}

// --- Opcodes following .tolk patterns ---
export const opcodes = {
  in: {
    // Basic messages
    TopUp: 0x00000000, // TODO: Define proper opcode when needed

    // LockReleaseTokenPool specific
    GetRebalancer: 0x1a2b3c4d,
    SetRebalancer: 0x2b3c4d5e,
    ProvideLiquidity: 0x3c4d5e6f,
    WithdrawLiquidity: 0x4d5e6f70,
    TransferLiquidity: 0x5e6f7081,

    // TokenPool base
    IsSupportedToken: 0x11223344,
    GetToken: 0x22334455,
    GetRmnProxy: 0x33445566,
    GetRouter: 0x44556677,
    SetRouter: 0x55667788,
    LockOrBurn: 0x7788990a,
    ReleaseOrMint: 0x8899aa0b,
  },
  out: {
    // Response opcodes
    GetRebalancerResponse: 0xa1b2c3d4,
    SetRebalancerResponse: 0xb2c3d4e5,
    ProvideLiquidityResponse: 0xc3d4e5f6,
    WithdrawLiquidityResponse: 0xd4e5f607,
    TransferLiquidityResponse: 0xe5f60718,

    // Events (using crc32 for consistency)
    RebalancerSet: crc32('LockReleaseTokenPool_RebalancerSet'),
    LiquidityAdded: crc32('LockReleaseTokenPool_LiquidityAdded'),
    LiquidityRemoved: crc32('LockReleaseTokenPool_LiquidityRemoved'),
    LiquidityTransferred: crc32('LockReleaseTokenPool_LiquidityTransferred'),
    RouterUpdated: crc32('TokenPool_RouterUpdated'),
  },
}

// --- Message builders ---
export const builder = {
  message: {
    in: {
      topUp: {
        encode: (): Builder => {
          return new Builder()
        },
        load: (src: Slice): null => {
          src.skip(32) // skip opcode
          return null
        },
      },

      getRebalancer: {
        encode: (msg: GetRebalancer): Builder => {
          return beginCell().storeUint(opcodes.in.GetRebalancer, 32).storeUint(msg.queryId, 64)
        },
        load: (src: Slice): GetRebalancer => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      },

      setRebalancer: {
        encode: (msg: SetRebalancer): Builder => {
          return beginCell()
            .storeUint(opcodes.in.SetRebalancer, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.rebalancer)
        },
        load: (src: Slice): SetRebalancer => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            rebalancer: src.loadAddress(),
          }
        },
      },

      provideLiquidity: {
        encode: (msg: ProvideLiquidity): Builder => {
          return beginCell()
            .storeUint(opcodes.in.ProvideLiquidity, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.amount, 256)
        },
        load: (src: Slice): ProvideLiquidity => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            amount: src.loadUintBig(256),
          }
        },
      },

      withdrawLiquidity: {
        encode: (msg: WithdrawLiquidity): Builder => {
          return beginCell()
            .storeUint(opcodes.in.WithdrawLiquidity, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.amount, 256)
        },
        load: (src: Slice): WithdrawLiquidity => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            amount: src.loadUintBig(256),
          }
        },
      },

      transferLiquidity: {
        encode: (msg: TransferLiquidity): Builder => {
          return beginCell()
            .storeUint(opcodes.in.TransferLiquidity, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.from)
            .storeUint(msg.amount, 256)
        },
        load: (src: Slice): TransferLiquidity => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            from: src.loadAddress(),
            amount: src.loadUintBig(256),
          }
        },
      },

      getRouter: {
        encode: (msg: GetRouter): Builder => {
          return beginCell().storeUint(opcodes.in.GetRouter, 32).storeUint(msg.queryId, 64)
        },
        load: (src: Slice): GetRouter => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      },

      setRouter: {
        encode: (msg: SetRouter): Builder => {
          return beginCell()
            .storeUint(opcodes.in.SetRouter, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.newRouter)
        },
        load: (src: Slice): SetRouter => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            newRouter: src.loadAddress(),
          }
        },
      },

      isSupportedToken: {
        encode: (msg: IsSupportedToken): Builder => {
          return beginCell()
            .storeUint(opcodes.in.IsSupportedToken, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.token)
        },
        load: (src: Slice): IsSupportedToken => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            token: src.loadAddress(),
          }
        },
      },

      getToken: {
        encode: (msg: GetToken): Builder => {
          return beginCell().storeUint(opcodes.in.GetToken, 32).storeUint(msg.queryId, 64)
        },
        load: (src: Slice): GetToken => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      },

      getRmnProxy: {
        encode: (msg: GetRmnProxy): Builder => {
          return beginCell().storeUint(opcodes.in.GetRmnProxy, 32).storeUint(msg.queryId, 64)
        },
        load: (src: Slice): GetRmnProxy => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      },
    },
  },

  data: (() => {
    // Contract data codec
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Builder => {
        const tokenPoolData = tokenPool.builder.data.contractData.encode(data.tokenPoolData)
        // Simplified encoding - extend as needed
        return beginCell()
          .storeUint(data.id, 32)
          .storeAddress(data.rebalancer)
          .storeBuilder(ownable2step.builder.data.traitData.encode(data.ownable))
          .storeRef(tokenPoolData)
      },
      load: (src: Slice): ContractData => {
        const id = src.loadUint(32)
        const ownable = ownable2step.builder.data.traitData.load(src)
        const rebalancer = src.loadMaybeAddress()
        const tokenPoolData = tokenPool.builder.data.contractData.load(src.loadRef().beginParse())
        return {
          id,
          ownable,
          rebalancer,
          tokenPoolData,
        }
      },
    }

    const contractDataEmpty = (
      id: number,
      owner: Address,
      token: jetton.JettonClientConfig,
      tokenDecimals: number,
      rmnProxy: Address,
      router: Address,
    ): ContractData => {
      return {
        id,
        ownable: {
          owner,
          pendingOwner: null,
        },
        rebalancer: null,
        tokenPoolData: {
          token,
          tokenDecimals,
          router,
          allowListEnabled: false,
          allowList: new Set<Address>(),
          remoteChainSelectors: new Map<number, number>(),
          remoteChainConfigs: new Map<number, RemoteChainConfig>(),
          remotePoolAddresses: new Map<bigint, CrossChainAddress>(),
          rateLimitAdmin: ZERO_ADDRESS,
        },
      }
    }

    return {
      contractData,
      contractDataEmpty,
    }
  })(),
}

// --- Contract client ---
export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0): ContractClient {
    const init = { code, data: builder.data.contractData.encode(data).asCell() }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  // --- Send methods ---
  async sendDeploy(p: ContractProvider, via: Sender, value: bigint) {
    return this.sendInternal(p, via, value, builder.message.in.topUp.encode().asCell())
  }

  async sendTopUp(p: ContractProvider, via: Sender, value: bigint) {
    return this.sendInternal(p, via, value, builder.message.in.topUp.encode().asCell())
  }

  async sendGetRebalancer(p: ContractProvider, via: Sender, value: bigint, body: GetRebalancer) {
    return this.sendInternal(p, via, value, builder.message.in.getRebalancer.encode(body).asCell())
  }

  async sendSetRebalancer(p: ContractProvider, via: Sender, value: bigint, body: SetRebalancer) {
    return this.sendInternal(p, via, value, builder.message.in.setRebalancer.encode(body).asCell())
  }

  async sendProvideLiquidity(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: ProvideLiquidity,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.provideLiquidity.encode(body).asCell(),
    )
  }

  async sendWithdrawLiquidity(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: WithdrawLiquidity,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.withdrawLiquidity.encode(body).asCell(),
    )
  }

  async sendTransferLiquidity(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: TransferLiquidity,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.transferLiquidity.encode(body).asCell(),
    )
  }

  async sendGetRouter(p: ContractProvider, via: Sender, value: bigint, body: GetRouter) {
    return this.sendInternal(p, via, value, builder.message.in.getRouter.encode(body).asCell())
  }

  async sendSetRouter(p: ContractProvider, via: Sender, value: bigint, body: SetRouter) {
    return this.sendInternal(p, via, value, builder.message.in.setRouter.encode(body).asCell())
  }

  async sendIsSupportedToken(
    p: ContractProvider,
    via: Sender,
    value: bigint,
    body: IsSupportedToken,
  ) {
    return this.sendInternal(
      p,
      via,
      value,
      builder.message.in.isSupportedToken.encode(body).asCell(),
    )
  }

  async sendGetToken(p: ContractProvider, via: Sender, value: bigint, body: GetToken) {
    return this.sendInternal(p, via, value, builder.message.in.getToken.encode(body).asCell())
  }

  async sendGetRmnProxy(p: ContractProvider, via: Sender, value: bigint, body: GetRmnProxy) {
    return this.sendInternal(p, via, value, builder.message.in.getRmnProxy.encode(body).asCell())
  }

  // --- Getter methods ---
  async getTypeAndVersion(p: ContractProvider): Promise<[string, string]> {
    const r = await p.get('typeAndVersion', [])
    const type = r.stack.readString()
    const version = r.stack.readString()
    return [type, version]
  }

  async getRebalancer(p: ContractProvider): Promise<Address> {
    const r = await p.get('getRebalancer', [])
    return r.stack.readAddress()
  }

  async getRouter(p: ContractProvider): Promise<Address> {
    const r = await p.get('getRouter', [])
    return r.stack.readAddress()
  }

  async getToken(p: ContractProvider): Promise<Address> {
    const r = await p.get('getToken', [])
    return r.stack.readAddress()
  }

  async getRmnProxy(p: ContractProvider): Promise<Address> {
    const r = await p.get('getRmnProxy', [])
    return r.stack.readAddress()
  }

  async isSupportedToken(p: ContractProvider, token: Address): Promise<boolean> {
    const r = await p.get('isSupportedToken', [
      { type: 'slice', cell: beginCell().storeAddress(token).endCell() },
    ])
    return r.stack.readBoolean()
  }

  async getTokenDecimals(p: ContractProvider): Promise<number> {
    const r = await p.get('getTokenDecimals', [])
    return r.stack.readNumber()
  }

  // TODO: Add more getters as needed
  // async getCurrentInboundRateLimiterState(p: ContractProvider): Promise<RateLimiter.TokenBucket>
  // async getCurrentOutboundRateLimiterState(p: ContractProvider): Promise<RateLimiter.TokenBucket>
  // async getRemotePools(p: ContractProvider, remoteChainSelector: bigint): Promise<Address[]>
  // async isRemotePool(p: ContractProvider, remoteChainSelector: bigint, remotePoolAddress: Cell): Promise<boolean>
}
