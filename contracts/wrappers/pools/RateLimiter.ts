import { beginCell, Builder, Cell, Slice } from '@ton/core'
import { CellCodec } from '../utils'

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
      encode: (data: Data): Builder => {
        return beginCell().storeBuilder(tokenBucket.encode(data.bucket))
      },
      load: (src: Slice): Data => {
        return {
          bucket: tokenBucket.load(src),
        }
      },
    }
    const config: CellCodec<Config> = {
      encode: (data: Config): Builder => {
        return beginCell()
          .storeBit(data.isEnabled)
          .storeUint(data.capacity, 128)
          .storeUint(data.rate, 128)
      },
      load: loadConfig,
    }
    const tokenBucket: CellCodec<TokenBucket> = {
      encode: (data: TokenBucket): Builder => {
        return beginCell()
          .storeUint(data.tokens, 128)
          .storeUint(data.lastUpdated, 256)
          .storeBit(data.isEnabled)
          .storeUint(data.capacity, 128)
          .storeUint(data.rate, 128)
      },
      load: loadTokenBucket,
    }
    return {
      tokenBucket,
      config,
    }
  })(),
}
