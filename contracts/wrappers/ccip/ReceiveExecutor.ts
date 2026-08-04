import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

export const VERSION = '1.6.2'

export const FACILITY_NAME = 'link.chain.ton.ccip.ReceiveExecutor'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))
