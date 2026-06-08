import * as s from '@ton/sandbox'
import * as c from '@ton/core'

import * as tw from '../../../wrappers/gen/test/Test_RemainingBitsOrRef'
import { contractCode } from '../../../wrappers/codeLoader'
import { builder as remainingBitsOrRefCodec } from '../../../wrappers/libraries/utils/RemainingBitsOrRef'

type RemainingEncoder = (data: c.Slice, b: c.Builder) => void
type RemainingDecoder = (s: c.Slice) => c.Slice

// Asserts the payload is stored inline (no ref)
const inlined = {
  encode: ((data, b) => {
    b.storeBit(false)
    b.storeSlice(data)
  }) as RemainingEncoder,
  load: ((s) => {
    expect(s.loadMaybeRef()).toBeNull()
    return s
  }) as RemainingDecoder,
}

// Asserts the payload is stored as a reference
const ref = {
  encode: ((data, b) => {
    b.storeMaybeRef(data.asCell())
  }) as RemainingEncoder,
  load: ((s) => {
    const r = s.loadMaybeRef()
    expect(r).not.toBeNull()
    s.endParse()
    return r!.beginParse()
  }) as RemainingDecoder,
}

// --- TS struct codecs mirroring the Tolk test structs ---

const FullCell = {
  build: (encode: RemainingEncoder): c.Cell => {
    const b = c.beginCell()
    b.storeUint(1, 256)
    b.storeUint(2, 256)
    b.storeUint(3, 256)
    const payload = c.beginCell().storeUint(4, 254).endCell().beginParse()
    encode(payload, b)
    return b.endCell()
  },
  load: (cell: c.Cell, decode: RemainingDecoder) => {
    const s = cell.beginParse()
    expect(s.loadUint(256)).toBe(1)
    expect(s.loadUint(256)).toBe(2)
    expect(s.loadUint(256)).toBe(3)
    const remaining = decode(s)
    expect(remaining.loadUint(254)).toBe(4)
    remaining.endParse()
  },
}

const JustOverFullCell = {
  build: (encode: RemainingEncoder): c.Cell => {
    const b = c.beginCell()
    b.storeUint(1, 256)
    b.storeUint(2, 256)
    b.storeUint(3, 256)
    const payload = c.beginCell().storeUint(4, 255).endCell().beginParse()
    encode(payload, b)
    return b.endCell()
  },
  load: (cell: c.Cell, decode: RemainingDecoder) => {
    const s = cell.beginParse()
    expect(s.loadUint(256)).toBe(1)
    expect(s.loadUint(256)).toBe(2)
    expect(s.loadUint(256)).toBe(3)
    const remaining = decode(s)
    expect(remaining.loadUint(255)).toBe(4)
    remaining.endParse()
  },
}

const InlinedWithReference = {
  build: (encode: RemainingEncoder): c.Cell => {
    const b = c.beginCell()
    b.storeUint(1, 256)
    b.storeUint(2, 256)
    b.storeUint(3, 256)
    const payload = c
      .beginCell()
      .storeUint(12, 254)
      .storeRef(c.beginCell().storeUint(34, 256).endCell())
      .endCell()
      .beginParse()
    encode(payload, b)
    return b.endCell()
  },
  load: (cell: c.Cell, decode: RemainingDecoder) => {
    const s = cell.beginParse()
    expect(s.loadUint(256)).toBe(1)
    expect(s.loadUint(256)).toBe(2)
    expect(s.loadUint(256)).toBe(3)
    const remaining = decode(s)
    expect(remaining.loadUint(254)).toBe(12)
    const refSlice = remaining.loadRef().beginParse()
    remaining.endParse()
    expect(refSlice.loadUint(256)).toBe(34)
    refSlice.endParse()
  },
}

const TooManyReferencesToInline = {
  build: (encode: RemainingEncoder): c.Cell => {
    const b = c.beginCell()
    b.storeRef(c.beginCell().storeUint(1, 256).endCell())
    b.storeRef(c.beginCell().storeUint(2, 256).endCell())
    b.storeRef(c.beginCell().storeUint(3, 256).endCell())
    const payload = c
      .beginCell()
      .storeRef(c.beginCell().storeUint(11, 256).endCell())
      .storeRef(c.beginCell().storeUint(12, 256).endCell())
      .storeRef(c.beginCell().storeUint(13, 256).endCell())
      .storeRef(c.beginCell().storeUint(14, 256).endCell())
      .endCell()
      .beginParse()
    encode(payload, b)
    return b.endCell()
  },
  load: (cell: c.Cell, decode: RemainingDecoder) => {
    const s = cell.beginParse()
    const loadUintRef = (s: c.Slice) => {
      const r = s.loadRef().beginParse()
      const val = r.loadUint(256)
      r.endParse()
      return val
    }
    expect(loadUintRef(s)).toBe(1)
    expect(loadUintRef(s)).toBe(2)
    expect(loadUintRef(s)).toBe(3)
    const remaining = decode(s)
    expect(loadUintRef(remaining)).toBe(11)
    expect(loadUintRef(remaining)).toBe(12)
    expect(loadUintRef(remaining)).toBe(13)
    expect(loadUintRef(remaining)).toBe(14)
    remaining.endParse()
  },
}

describe('RemainingBitsOrRef Unit Tests', () => {
  let wrapper: s.SandboxContract<tw.RemainingBitsOrRefTestWrapper>
  let blockchain: s.Blockchain

  beforeAll(async () => {
    blockchain = await s.Blockchain.create()
    const init = {
      code: await contractCode.ccip.local('test.lib.RemainingBitsOrRef'),
      data: c.Cell.EMPTY,
    }

    wrapper = blockchain.openContract(
      new tw.RemainingBitsOrRefTestWrapper(c.contractAddress(0, init), init),
    )
    const deployer = await blockchain.treasury('deployer')

    await wrapper.sendDeploy(deployer.getSender(), c.toNano('0.05'))
  })

  describe('Tolk encoding uses inline or ref as expected', () => {
    it('FullCell payload is stored inline', async () => {
      const cell = await wrapper.getTestFullCell()
      FullCell.load(cell, inlined.load)
    })

    it('JustOverFullCell payload is stored as a reference', async () => {
      const cell = await wrapper.getTestJustOverFullCell()
      JustOverFullCell.load(cell, ref.load)
    })

    it('InlinedWithReference payload is stored inline', async () => {
      const cell = await wrapper.getTestInlinedWithReference()
      InlinedWithReference.load(cell, inlined.load)
    })

    it('TooManyReferencesToInline payload is stored as a reference', async () => {
      const cell = await wrapper.getTestTooManyReferencesToInline()
      TooManyReferencesToInline.load(cell, ref.load)
    })
  })

  describe('TS codec produces cells equal to Tolk', () => {
    it('FullCell', async () => {
      const tolkCell = await wrapper.getTestFullCell()
      const tsCell = FullCell.build(remainingBitsOrRefCodec.encode)
      expect(tsCell.equals(tolkCell)).toBe(true)
      FullCell.load(tsCell, remainingBitsOrRefCodec.load)
    })

    it('JustOverFullCell', async () => {
      const tolkCell = await wrapper.getTestJustOverFullCell()
      const tsCell = JustOverFullCell.build(remainingBitsOrRefCodec.encode)
      expect(tsCell.equals(tolkCell)).toBe(true)
      JustOverFullCell.load(tsCell, remainingBitsOrRefCodec.load)
    })

    it('InlinedWithReference', async () => {
      const tolkCell = await wrapper.getTestInlinedWithReference()
      const tsCell = InlinedWithReference.build(remainingBitsOrRefCodec.encode)
      expect(tsCell.equals(tolkCell)).toBe(true)
      InlinedWithReference.load(tsCell, remainingBitsOrRefCodec.load)
    })

    it('TooManyReferencesToInline', async () => {
      const tolkCell = await wrapper.getTestTooManyReferencesToInline()
      const tsCell = TooManyReferencesToInline.build(remainingBitsOrRefCodec.encode)
      expect(tsCell.equals(tolkCell)).toBe(true)
      TooManyReferencesToInline.load(tsCell, remainingBitsOrRefCodec.load)
    })
  })
})
