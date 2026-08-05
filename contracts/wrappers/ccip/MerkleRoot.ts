import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../utils'

export const CONTRACT_VERSION = '1.6.1'

export const FACILITY_NAME = 'link.chain.ton.ccip.MerkleRoot'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export const opcodes = {
  in: {
    validate: 0x038ede91,
    markState: 0x019f4cd2,
  },
}
