import { Cell, toNano } from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

import { contractCode } from '../codeLoader'
import * as fq from './FeeQuoter'

export const ARTIFACT_NAME = 'OnRamp'
export const FACILITY_NAME = 'link.chain.ton.ccip.OnRamp'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.0': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME), // Last bundle with version 1.6.0
}
export const CONTRACT_VERSION = '1.6.1'

export const onrampSendCost = toNano('4') // TODO this should be calculated based on the message size and gas limit, but for now we use a fixed value

export const opcodes = {
  in: {
    onrampSend: 0xdcf993c2,
    getValidatedFee: 0x9c2ccc7e,
    get messageValidated() {
      return fq.opcodes.out.messageValidated
    },
    get messageValidationFailed() {
      return fq.opcodes.out.messageValidationFailed
    },
    executorRequestsLockOrBurn: 0x9be1fb61,
    executorFinishedSuccessfully: 0xcfa6b336,
    executorFinishedWithError: 0xc4068e21,
    setDynamicConfig: 0xa178c62e,
    updateDestChainConfigs: 0x1a246b6c,
    updateSendExecutor: 0x82901c45,
    updateAllowlists: 0x9dc06185,
    withdrawFeeTokens: 0x7052dc75,
  },
  out: {
    messageValidated: 0x2afb11bd,
    messageValidationFailed: 0xac1dd12e,
  },
}
