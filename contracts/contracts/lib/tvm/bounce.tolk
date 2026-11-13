// Values of the rich bounce body (`RichBounceBody`, TL-B `new_bounce_body`), see global version 12 in
// https://github.com/ton-blockchain/ton/blob/master/doc/GlobalVersions.md

fun RichBounce_Phase.from(body: RichBounceBody): RichBounce_Phase {
    // SAFETY: RichBounceBody.bouncedByPhase is guaranteed to be a valid RichBounce_Phase value.
    return body.bouncedByPhase as int as RichBounce_Phase;
}

/// RichBounceBody.bouncedByPhase: the transaction phase that bounced the message.
enum RichBounce_Phase {
    /// The compute phase was skipped: RichBounceBody.exitCode is a RichBounce_ComputeSkipReason.
    ComputeSkipped = 0,
    /// The compute phase failed: RichBounceBody.exitCode is the compute phase exit code.
    ComputeFailed = 1,
    /// The action phase failed: RichBounceBody.exitCode is the action phase result code.
    ActionFailed = 2,
}

/// RichBounceBody.exitCode when the compute phase was skipped (RichBounce_Phase.ComputeSkipped).
enum RichBounce_ComputeSkipReason: int32 {
    /// The account is uninit or frozen, and the message carries no state init.
    NoState = -1,
    /// The account is uninit or frozen, and the message's state init does not match its hash.
    BadState = -2,
    /// The message value cannot buy any gas.
    NoGas = -3,
    /// The account is suspended.
    Suspended = -4,
}
