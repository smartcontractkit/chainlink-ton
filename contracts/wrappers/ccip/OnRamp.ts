import { Cell } from '@ton/core'

import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

import { contractCode } from '../codeLoader'
import { Costs } from './Router'

export const ARTIFACT_NAME = 'OnRamp'
export const FACILITY_NAME = 'link.chain.ton.ccip.OnRamp'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const SUPPORTED_PREV_VERSIONS: Record<string, () => Promise<Cell>> = {
  '1.6.0': () => contractCode.ccip.release_1_6_2(ARTIFACT_NAME), // Last bundle with version 1.6.0
}
export const CONTRACT_VERSION = '1.7.0'

/** Value a Router forwards with an OnRamp_Send that may carry a token transfer. */
export const onrampSendCost = Costs.onRampSendWithTokens
