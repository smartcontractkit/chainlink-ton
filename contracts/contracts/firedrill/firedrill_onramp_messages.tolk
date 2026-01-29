type FiredrillOnRamp_InMessage =
    | FiredrillOnRamp_EmitCCIPMessageSent
    ;

struct (0x00000001) FiredrillOnRamp_EmitCCIPMessageSent {
    sender: address;
    sequenceNumber: uint64;
}
