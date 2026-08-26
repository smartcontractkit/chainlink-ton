import * as c from '@ton/core'
import { crc32 } from 'zlib'

import { errorCode, facilityId } from '../utils'
import { contractCode } from '../codeLoader'

import * as receiver from '../gen/ccip/Receiver'

export const FACILITY_NAME = 'link.chain.ton.ccip.test.Receiver'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))
export const CONTRACT_VERSION = '1.6.1'

export const ARTIFACT_NAME = 'ccip.test.receiver'
export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<c.Cell>> = {
  '1.6.0': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME), // Last bundle with version 1.6.0
}

export const opcodes = {
  in: {
    CCIPReceive: receiver.CCIPReceive.PREFIX,
    updateBehavior: 0xcf87a147,
    updateAuthorizedCaller: 0x9f5e489f,
  },
}
