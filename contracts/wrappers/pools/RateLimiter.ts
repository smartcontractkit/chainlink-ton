import { beginCell, Cell, Slice } from '@ton/core'
import { CellCodec, CellLoader } from '../utils'

export type TokenBucket = {
  tokens: bigint // ─────╮ Current number of tokens that are in the bucket.
  lastUpdated: bigint // │ Timestamp in seconds of the last token refill, good for 100+ years.
  isEnabled: boolean // ─╯ Indication whether the rate limiting is enabled or not.
  capacity: bigint // ──╮ Maximum number of tokens that can be in the bucket.
  rate: bigint // ──────╯ Number of tokens per second that the bucket is refilled.
}

export type Config = {
  isEnabled: boolean // Indication whether the rate limiting should be enabled.
  capacity: bigint // ──╮ Specifies the capacity of the rate limiter.
  rate: bigint // ──────╯ Specifies the rate of the rate limiter.
}

export type Data = {
  bucket: TokenBucket
}

const loadTokenBucket = (slice: Slice): TokenBucket => {
  const tokens = slice.loadUintBig(128)
  const lastUpdated = slice.loadUintBig(32)
  const isEnabled = slice.loadBit()
  const capacity = slice.loadUintBig(128)
  const rate = slice.loadUintBig(128)
  return {
    tokens,
    lastUpdated,
    isEnabled,
    capacity,
    rate,
  }
}

const loadConfig = (slice: Slice): Config => {
  return {
    isEnabled: slice.loadBit(),
    capacity: slice.loadUintBig(128),
    rate: slice.loadUintBig(128),
  }
}

export const builder = {
  data: (() => {
    const contractData: CellCodec<Data> = {
      encode: (data: Data): Cell => {
        return beginCell().storeBuilder(tokenBucket.encode(data.bucket).asBuilder()).endCell()
      },
      decode: (cell: Cell): Data => {
        const slice = cell.beginParse()
        return {
          bucket: tokenBucket.load(slice),
        }
      },
    }
    const config: CellCodec<Config> & CellLoader<Config> = {
      encode: (data: Config): Cell => {
        return beginCell()
          .storeBit(data.isEnabled)
          .storeUint(data.capacity, 128)
          .storeUint(data.rate, 128)
          .endCell()
      },
      decode: (cell: Cell): Config => {
        const slice = cell.beginParse()
        return loadConfig(slice)
      },
      load: loadConfig,
    }
    const tokenBucket: CellCodec<TokenBucket> & CellLoader<TokenBucket> = {
      encode: (data: TokenBucket): Cell => {
        return beginCell()
          .storeUint(data.tokens, 128)
          .storeUint(data.lastUpdated, 256)
          .storeBit(data.isEnabled)
          .storeUint(data.capacity, 128)
          .storeUint(data.rate, 128)
          .endCell()
      },
      decode: (cell: Cell): TokenBucket => {
        return loadTokenBucket(cell.beginParse())
      },
      load: loadTokenBucket,
    }
    return {
      tokenBucket,
      config,
    }
  })(),
}
