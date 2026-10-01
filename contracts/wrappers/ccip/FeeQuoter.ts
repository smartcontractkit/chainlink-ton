import * as c from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'
import { asSnakedCell, fromSnakeData } from '../../src/utils'
import { contractCode } from '../codeLoader'

import * as rtGen from '../gen/ccip/Router'
import * as fqGen from '../gen/ccip/FeeQuoter'
import * as CrossChainAddressCodec from './common/CrossChainAddressCodec'

// Copied from rtGen.Router_CCIPSend.store, but with the extraArgs as Cell

export interface FeeQuoter_GetValidatedFee {
  msg: Router_CCIPSend
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
  let prefix = s.loadUint(32)
  if (prefix !== expected) {
    throw new Error(
      `Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`,
    )
  }
}

function loadTolkRemaining(s: c.Slice): c.Slice {
  let rest = s.clone()
  s.loadBits(s.remainingBits)
  while (s.remainingRefs) {
    s.loadRef()
  }
  return rest
}

export const FeeQuoter_GetValidatedFee = {
  fromSlice(s: c.Slice): FeeQuoter_GetValidatedFee {
    return (() => {
      loadAndCheckPrefix32(
        s,
        fqGen.FeeQuoter_GetValidatedFee.PREFIX,
        'FeeQuoter_GetValidatedFee_V2',
      )
      return {
        msg: Router_CCIPSend.fromSlice(s),
        context: s.loadMaybeRef(),
      }
    })()
  },
  store(self: FeeQuoter_GetValidatedFee, b: c.Builder): void {
    b.storeUint(fqGen.FeeQuoter_GetValidatedFee.PREFIX, 32)
    b.storeRef(Router_CCIPSend.toCell(self.msg))
    b.storeMaybeRef(null)
  },
  toCell(self: FeeQuoter_GetValidatedFee): c.Cell {
    const b = c.beginCell()
    FeeQuoter_GetValidatedFee.store(self, b)
    return b.endCell()
  },
}

export interface Router_CCIPSend {
  queryID: bigint
  destChainSelector: bigint
  receiver: rtGen.CrossChainAddress
  data: c.Cell
  tokenAmounts: rtGen.SnakedCell<rtGen.TokenAmount>
  feeToken: c.Address | null
  extraArgs: c.Cell
}

export const Router_CCIPSend = {
  fromSlice(s: c.Slice): Router_CCIPSend {
    loadAndCheckPrefix32(s, rtGen.Router_CCIPSend.PREFIX, 'Router_CCIPSend')
    return {
      queryID: s.loadUintBig(64),
      destChainSelector: s.loadUintBig(64),
      receiver: CrossChainAddressCodec.unpackFromSlice(s),
      data: s.loadRef(),
      tokenAmounts: fromSnakeData(s.loadRef(), rtGen.TokenAmount.fromSlice),
      feeToken: s.loadMaybeAddress(),
      extraArgs: s.loadRef(),
    }
  },
  store: (self: Router_CCIPSend, b: c.Builder): void => {
    b.storeUint(rtGen.Router_CCIPSend.PREFIX, 32)
    b.storeUint(self.queryID, 64)
    b.storeUint(self.destChainSelector, 64)
    rtGen.CrossChainAddress.store(self.receiver, b)
    b.storeRef(self.data)
    b.storeRef(
      asSnakedCell(self.tokenAmounts, (item: rtGen.TokenAmount): c.Builder => {
        const b = c.beginCell()
        rtGen.TokenAmount.store(item, b)
        return b
      }).asBuilder(),
    )
    b.storeAddress(self.feeToken)
    b.storeRef(self.extraArgs)
  },
  toCell: (self: Router_CCIPSend): c.Cell => {
    const b = c.beginCell()
    Router_CCIPSend.store(self, b)
    return b.endCell()
  },
}

export interface FeeQuoter_MessageValidationFailed {
  readonly $: 'FeeQuoter_MessageValidationFailed'
  error: bigint
  msg: Router_CCIPSend
  context: c.Cell | null
}

export const FeeQuoter_MessageValidationFailed = {
  fromSlice(s: c.Slice): FeeQuoter_MessageValidationFailed {
    return (() => {
      loadAndCheckPrefix32(
        s,
        fqGen.FeeQuoter_MessageValidationFailed.PREFIX,
        'FeeQuoter_MessageValidationFailed_V2',
      )
      return {
        $: 'FeeQuoter_MessageValidationFailed',
        error: s.loadUintBig(256),
        msg: Router_CCIPSend.fromSlice(s.loadRef().beginParse()),
        context: s.loadMaybeRef(),
      }
    })()
  },
  store(self: FeeQuoter_MessageValidationFailed, b: c.Builder): void {
    b.storeUint(fqGen.FeeQuoter_MessageValidationFailed.PREFIX, 32)
    b.storeUint(self.error, 256)
    b.storeRef(Router_CCIPSend.toCell(self.msg))
    b.storeMaybeRef(self.context)
  },
  toCell(self: FeeQuoter_MessageValidationFailed): c.Cell {
    const b = c.beginCell()
    FeeQuoter_MessageValidationFailed.store(self, b)
    return b.endCell()
  },
}

export const ARTIFACT_NAME = 'FeeQuoter'
export const FEE_QUOTER_SUPPORTED_PREV_VERSIONS = ['1.6.2'] as const
export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<c.Cell>> = {
  '1.6.2': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME),
}
export const FEE_QUOTER_CONTRACT_VERSION = '1.7.0'

export const FACILITY_NAME = 'link.chain.ton.ccip.FeeQuoter'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const opcodes = {
  in: {
    updatePrices: 0xde852b1b,
    updateFeeTokens: 0xd0984986,
    updateTransferFeeConfigs: 0xb2826316,
    updateDestChainConfig: 0x2d2410f6,
    getValidatedFee: 0x7496ff56,
    addPriceUpdater: crc32('FeeQuoter_AddPriceUpdater'),
    removePriceUpdater: crc32('FeeQuoter_RemovePriceUpdater'),
  },
  out: {
    messageValidated: 0x1fa60374,
    messageValidationFailed: 0xbcf0ab0f,
  },
}
