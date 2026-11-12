/** Exit codes thrown by code the Tolk compiler generates (not TVM errors). Mirrors `TolkError` (contracts/lib/tvm/errors.tolk). */
export enum TolkError {
  /** Default `throwIfOpcodeDoesNotMatch` of `fromSlice` / `fromCell` / `lazy`. */
  OpcodeMismatch = 63,
}
