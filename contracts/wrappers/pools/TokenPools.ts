import { CrossChainAddress } from '../ccip/OffRamp'
import { TokenBucket } from './RateLimiter'
import * as ownable2step from '../libraries/access/Ownable2Step'
import {
  JettonClientConfig,
  jettonClientConfigFromCell,
  jettonClientConfigToCell,
} from '../examples/jetton'
import { Address, beginCell, Cell, Dictionary } from '@ton/core'
import { loadDict, loadMap } from '../../src/utils/dict'
import { asSnakeData, fromSnakeData } from '../../src/utils'
import { rateLimiter } from '.'
import { CellCodec } from '../utils'

export type RemoteChainConfig = {
  outboundRateLimiterConfig: TokenBucket // Outbound rate limited config, meaning the rate limits for all of the onRamps for the given chain
  inboundRateLimiterConfig: TokenBucket // Inbound rate limited config, meaning the rate limits for all of the offRamps for the given chain
  remoteTokenAddress: CrossChainAddress // address of the remote token, ABI encoded in the case of a remote EVM chain.
  remotePools: bigint[] // vec<256>  // Set of remote pool hashes, ABI encoded in the case of a remote EVM chain. // Original implementation uses bytes32 but in tolk keccak returns 256
}

export type Data = {
  /// The token managed by this pool
  token: JettonClientConfig

  /// Token decimals
  tokenDecimals: number // uint8

  /// RMN proxy address
  // rmnProxy: Address

  allowListEnabled: boolean

  allowList: Set<Address>

  /// Router address
  router: Address

  remoteChainSelectors: Map<number, number> // uint64 -> uint64

  remoteChainConfigs: Map<number, RemoteChainConfig> // uint64 -> cell

  remotePoolAddresses: Map<bigint, CrossChainAddress>

  rateLimitAdmin: Address
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<Data> = {
      encode: (tokenPoolData: Data) => {
        const allowListMap = new Map<Address, boolean>()
        for (const [k, v] of tokenPoolData.allowList.entries()) {
          allowListMap.set(k, true)
        }

        const remoteChainConfigs = new Map<number, Cell>()
        for (const [k, v] of tokenPoolData.remoteChainConfigs.entries()) {
          remoteChainConfigs.set(k, builder.data.remoteChainConfig.encode(v))
        }

        const remotePoolAddresses = new Map<bigint, Cell>()
        for (const [k, v] of tokenPoolData.remotePoolAddresses.entries()) {
          remotePoolAddresses.set(
            k,
            beginCell()
              .storeBuffer(v as Buffer)
              .endCell(),
          )
        }

        return beginCell()
          .storeRef(jettonClientConfigToCell(tokenPoolData.token))
          .storeUint(tokenPoolData.tokenDecimals, 8)
          .storeBit(tokenPoolData.allowListEnabled)
          .storeDict(loadMap(Dictionary.Keys.Address(), Dictionary.Values.Bool(), allowListMap))
          .storeAddress(tokenPoolData.router)
          .storeDict(
            loadMap(
              Dictionary.Keys.Uint(64),
              Dictionary.Values.Uint(64),
              tokenPoolData.remoteChainSelectors,
            ),
          )
          .storeDict(
            loadMap(Dictionary.Keys.Uint(64), Dictionary.Values.Cell(), remoteChainConfigs),
          )
          .storeDict(
            loadMap(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), remotePoolAddresses),
          )
          .storeAddress(tokenPoolData.rateLimitAdmin)
          .endCell()
      },

      decode: (data: Cell): Data => {
        const s = data.beginParse()
        const token = jettonClientConfigFromCell(s.loadRef())
        const tokenDecimals = s.loadUint(8)
        const allowListEnabled = s.loadBit()
        const allowListMap = loadDict(
          s.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Address()),
        )
        const allowList = new Set<Address>()
        for (const [k, v] of allowListMap.entries()) {
          allowList.add(k)
        }
        const router = s.loadAddress()
        const remoteChainSelectors = loadDict(
          s.loadDict(Dictionary.Keys.Uint(64), Dictionary.Values.Uint(64)),
        )
        const remoteChainConfigsCells = loadDict(
          s.loadDict(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
        )
        const remoteChainConfigs = new Map<number, RemoteChainConfig>()
        for (const [k, v] of remoteChainConfigsCells.entries()) {
          remoteChainConfigs.set(k, builder.data.remoteChainConfig.decode(v))
        }
        const remotePoolAddressesAsCells = loadDict(
          s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
        )
        const remotePoolAddresses = new Map<bigint, CrossChainAddress>()
        for (const [k, v] of remotePoolAddressesAsCells.entries()) {
          const vSlice = v.beginParse()
          remotePoolAddresses.set(
            k,
            vSlice.loadBuffer(vSlice.remainingBits / 8) as CrossChainAddress,
          )
        }
        const rateLimitAdmin = s.loadAddress()
        return {
          token,
          tokenDecimals,
          allowListEnabled,
          allowList,
          router,
          remoteChainSelectors,
          remoteChainConfigs,
          remotePoolAddresses,
          rateLimitAdmin,
        }
      },
    }
    const remoteChainConfig: CellCodec<RemoteChainConfig> = {
      encode: (config: RemoteChainConfig): Cell => {
        const remotePools = new Map<bigint, bigint>()
        for (const v of config.remotePools) {
          remotePools.set(v, v)
        }

        return beginCell()
          .storeBuilder(
            rateLimiter.builder.data.tokenBucket
              .encode(config.outboundRateLimiterConfig)
              .asBuilder(),
          )
          .storeBuilder(
            rateLimiter.builder.data.tokenBucket
              .encode(config.inboundRateLimiterConfig)
              .asBuilder(),
          )
          .storeRef(
            beginCell()
              .storeBuffer(config.remoteTokenAddress as Buffer)
              .endCell(),
          )
          .storeDict(
            loadMap(Dictionary.Keys.BigUint(256), Dictionary.Values.BigUint(256), remotePools),
          )
          .endCell()
      },

      decode: (data: Cell): RemoteChainConfig => {
        const s = data.beginParse()
        const outboundRateLimiterConfig = rateLimiter.builder.data.tokenBucket.load(s)
        const inboundRateLimiterConfig = rateLimiter.builder.data.tokenBucket.load(s)
        const remoteTokenAddressSlice = s.loadRef().beginParse()
        const remoteTokenAddress = remoteTokenAddressSlice.loadBuffer(
          remoteTokenAddressSlice.remainingBits / 8,
        )

        const remotePoolsDict = loadDict(
          s.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.BigUint(256)),
        )
        const remotePools: bigint[] = []
        for (const [k, _v] of remotePoolsDict.entries()) {
          remotePools.push(k)
        }
        return {
          outboundRateLimiterConfig,
          inboundRateLimiterConfig,
          remoteTokenAddress,
          remotePools,
        }
      },
    }

    return {
      contractData,
      remoteChainConfig,
    }
  })(),
}
