import * as c from '@ton/core'

/// Methods that abigen wrappers implement

export interface Decoder<T> {
  fromSlice(s: c.Slice): T
}

export interface Encoder<T> {
  store(self: T, b: c.Builder): void
}

export interface Codec<T> extends Decoder<T>, Encoder<T> {}
