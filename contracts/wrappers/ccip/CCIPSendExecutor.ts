import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

import * as fq from './FeeQuoter'

export const CONTRACT_VERSION = '1.6.1'

export const FACILITY_NAME = 'link.chain.ton.ccip.CCIPSendExecutor'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const opcodes = {
  in: {
    execute: 0xaf3c62b3,
    messageValidated: fq.opcodes.out.messageValidated,
    messageValidationFailed: fq.opcodes.out.messageValidationFailed,
    tokenRegistryReturnTokenInfo: 0xddccddb5,
  },
}
