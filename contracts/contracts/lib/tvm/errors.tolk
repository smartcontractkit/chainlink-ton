/// TVMError enumerates common errors that can occur in the TON Virtual Machine (TVM).
enum TVMError {
    IntegerOverflow = 4,
    CellOverflow = 8,
    CellUnderflow = 9,
}

/// TolkError enumerates exit codes thrown by code the Tolk compiler generates (not TVM errors).
enum TolkError {
    /// Default `throwIfOpcodeDoesNotMatch` of `fromSlice` / `fromCell` / `lazy`: the message (or
    /// cell) does not start with any of the expected opcodes.
    OpcodeMismatch = 63,
}
