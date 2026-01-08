export const FACILITY_NAME = 'com.chainlink.ton.lib.crypto.MerkleMultiProof'
export const FACILITY_ID = 462
export const ERROR_CODE = FACILITY_ID * 100

export enum Errors {
  InvalidProofLeavesCannotBeEmpty = ERROR_CODE,
  InvalidProofLeavesTooLarge,
  InvalidProofProofsTooLarge,
  InvalidProofTotalHashesExceededMax,
}
