import { Cell } from '@ton/core'
import { contractCode } from '../codeLoader'
import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

export const ARTIFACT_NAME = 'OffRamp'
export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.2': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME),
}
export const OFFRAMP_CONTRACT_VERSION = '1.6.3'

export const FACILITY_NAME = 'link.chain.ton.ccip.OffRamp'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))
