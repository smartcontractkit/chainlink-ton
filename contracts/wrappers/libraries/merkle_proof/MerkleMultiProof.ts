import { crc32 } from 'zlib'
import { errorCode, facilityId } from '../../utils'

export const FACILITY_NAME = 'link.chain.ton.lib.crypto.MerkleMultiProof'
export const FACILITY_ID = facilityId(crc32(FACILITY_NAME))
export const ERROR_CODE = errorCode(crc32(FACILITY_NAME))

export enum Errors {
  InvalidProofLeavesCannotBeEmpty = 12000,
  InvalidProofLeavesTooLarge,
  InvalidProofProofsTooLarge,
  InvalidProofTotalHashesExceededMax,
}
