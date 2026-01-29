type FiredrillOffRamp_InMessage =
    | FiredrillOffRamp_EmitSourceChainConfigSet
    | FiredrillOffRamp_EmitCommitReportAccepted
    ;

struct (0x00000002) FiredrillOffRamp_EmitSourceChainConfigSet {
}

struct (0x00000003) FiredrillOffRamp_EmitCommitReportAccepted {
    minSeqNr: uint64;
    maxSeqNr: uint64;
}
