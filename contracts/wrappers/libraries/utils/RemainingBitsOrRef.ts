import * as c from '@ton/core'

export type RemainingBitsOrRef = c.Slice

// This is the codec for RemainingBitsOrRef<T> type in Tolk
// It allows storing/loading a Slice either directly as bits or as a reference
// to a cell, depending on available space.
// It has a different interface than the usual CellCodec<T> because it needs
// to access the Builder instance to check available bits.
export const builder = {
  encode: function (data: RemainingBitsOrRef, b: c.Builder) {
    const availableBits = 1023 - b.bits
    const availableRefs = 4 - b.refs
    if (availableBits < data.remainingBits + 1 || availableRefs < data.remainingRefs) {
      // not enough space, create a new cell
      b.storeMaybeRef(data.asCell())
    } else {
      // can be inlined
      b.storeBit(false)
      b.storeSlice(data)
    }
  },
  load: function (src: c.Slice) {
    const ref = src.loadMaybeRef()
    if (ref) {
      src.endParse()
      return ref.beginParse()
    } else {
      return src
    }
  },
}
