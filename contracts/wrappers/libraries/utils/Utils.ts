import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../../utils'

export const FACILITY_NAME = 'link.chain.ton.lib.Utils'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum Errors {
  InvalidData = 13500, // Facility ID * 100
  BitmapOutOfBounds,
}
