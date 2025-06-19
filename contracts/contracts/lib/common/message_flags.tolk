/// Having msgFlags (4 bits), check that a message is bounced.
/// Effectively, it's `msgFlags & 1` (the lowest bit present).
fun isMessageBounced(msgFlags: int): int
    asm "1 PUSHINT" "AND";
