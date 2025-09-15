import { CrossChainAddress } from '../ccip/OffRamp'
import { TokenBucket } from './RateLimiter'
import * as ownable2step from '../libraries/access/Ownable2Step'
import * as jetton from '../examples/jetton'
import { Address, beginCell, Builder, Cell, Dictionary, Slice } from '@ton/core'
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
  token: jetton.JettonClientConfig

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
      encode: (tokenPoolData: Data): Builder => {
        const allowListMap = new Map<Address, boolean>()
        for (const [k, v] of tokenPoolData.allowList.entries()) {
          allowListMap.set(k, true)
        }

        const remoteChainConfigs = new Map<number, Cell>()
        for (const [k, v] of tokenPoolData.remoteChainConfigs.entries()) {
          remoteChainConfigs.set(k, builder.data.remoteChainConfig.encode(v).asCell())
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
          .storeRef(jetton.builder.data.traitData.encode(tokenPoolData.token).asCell())
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
      },

      load: (src: Slice): Data => {
        const token = jetton.builder.data.traitData.load(src.loadRef().beginParse())
        const tokenDecimals = src.loadUint(8)
        const allowListEnabled = src.loadBit()
        const allowListMap = loadDict(
          src.loadDict(Dictionary.Keys.Address(), Dictionary.Values.Bool()),
        )
        const allowList = new Set<Address>()
        for (const [k, v] of allowListMap.entries()) {
          allowList.add(k)
        }
        const router = src.loadAddress()
        const remoteChainSelectors = loadDict(
          src.loadDict(Dictionary.Keys.Uint(64), Dictionary.Values.Uint(64)),
        )
        const remoteChainConfigsCells = loadDict(
          src.loadDict(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
        )
        const remoteChainConfigs = new Map<number, RemoteChainConfig>()
        for (const [k, v] of remoteChainConfigsCells.entries()) {
          remoteChainConfigs.set(k, builder.data.remoteChainConfig.load(v.beginParse()))
        }
        const remotePoolAddressesAsCells = loadDict(
          src.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell()),
        )
        const remotePoolAddresses = new Map<bigint, CrossChainAddress>()
        for (const [k, v] of remotePoolAddressesAsCells.entries()) {
          const vSlice = v.beginParse()
          remotePoolAddresses.set(
            k,
            vSlice.loadBuffer(vSlice.remainingBits / 8) as CrossChainAddress,
          )
        }
        const rateLimitAdmin = src.loadAddress()
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
      encode: (config: RemoteChainConfig): Builder => {
        const remotePools = new Map<bigint, bigint>()
        for (const v of config.remotePools) {
          remotePools.set(v, v)
        }

        return beginCell()
          .storeBuilder(
            rateLimiter.builder.data.tokenBucket.encode(config.outboundRateLimiterConfig),
          )
          .storeBuilder(
            rateLimiter.builder.data.tokenBucket.encode(config.inboundRateLimiterConfig),
          )
          .storeRef(
            beginCell()
              .storeBuffer(config.remoteTokenAddress as Buffer)
              .endCell(),
          )
          .storeDict(
            loadMap(Dictionary.Keys.BigUint(256), Dictionary.Values.BigUint(256), remotePools),
          )
      },

      load: (src: Slice): RemoteChainConfig => {
        const outboundRateLimiterConfig = rateLimiter.builder.data.tokenBucket.load(src)
        const inboundRateLimiterConfig = rateLimiter.builder.data.tokenBucket.load(src)
        const remoteTokenAddressSlice = src.loadRef().beginParse()
        const remoteTokenAddress = remoteTokenAddressSlice.loadBuffer(
          remoteTokenAddressSlice.remainingBits / 8,
        )

        const remotePoolsDict = loadDict(
          src.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.BigUint(256)),
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
