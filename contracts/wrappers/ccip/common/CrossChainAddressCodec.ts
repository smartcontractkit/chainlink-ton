import * as c from '@ton/core'
import * as rt from '../../gen/ccip/Router'
import { CellCodec } from '../../utils'

export function ToBuffer(cca: c.Slice): Buffer {
  const s = cca.clone()
  return s.loadBuffer(s.remainingBits / 8)
}

export function FromBuffer(buffer: Buffer): rt.CrossChainAddress {
  const addrSlice = c.beginCell().storeBuffer(buffer).asSlice()
  return addrSlice as rt.CrossChainAddress
}

export function packToBuilder(self: c.Slice, b: c.Builder): void {
  const src = self.clone()
  const buffer = src.loadBuffer(src.remainingBits / 8)
  b.storeBuilder(codec.encode(buffer))
}

export function unpackFromSlice(s: c.Slice): c.Slice {
  const buff = codec.load(s)
  return c.beginCell().storeBuffer(buff).asSlice()
}

export const codec: CellCodec<Buffer> = {
  encode: (addr: Buffer): c.Builder => {
    if (addr.byteLength > 64) {
      throw new Error('CrossChainAddress too long')
    }
    return c.beginCell().storeUint(addr.length, 8).storeBuffer(addr, addr.length)
  },
  load: (src: c.Slice): Buffer => {
    const len = Number(src.loadUint(8))
    if (len > 64) {
      throw new Error('CrossChainAddress too long')
    }
    return src.loadBuffer(len)
  },
}
