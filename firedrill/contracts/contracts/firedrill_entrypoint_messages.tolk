import "../../../contracts/contracts/lib/utils.tolk"

type FiredrillEntrypoint_InMessage =
    | FiredrillEntrypoint_PrepareRegister
    | FiredrillEntrypoint_DrillPendingCommitPendingQueueTxSpike
    | FiredrillEntrypoint_DrillPendingExecution
    | FiredrillEntrypoint_DrillPriceRegistries
    ;

struct (0x10000001) FiredrillEntrypoint_PrepareRegister {
}

struct (0x10000002) FiredrillEntrypoint_DrillPendingCommitPendingQueueTxSpike {
    from: uint64;
    to: uint64;
}

struct (0x10000003) FiredrillEntrypoint_DrillPendingExecution {
    from: uint64;
    to: uint64;
}

struct (0x10000004) FiredrillEntrypoint_DrillPriceRegistries {
}
