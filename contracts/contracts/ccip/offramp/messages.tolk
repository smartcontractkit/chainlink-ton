import "types"
import "../../lib/ocr/types.tolk"
import "../../lib/ocr/multi_ocr3_base.tolk"
import "../../lib/receiver/messages.tolk"
import "../common/types.tolk"
import "../../lib/utils"
import "../../lib/funding/withdrawable"
import "../../lib/versioning/upgradeable"
import "../rmn_remote/lib"

type OffRamp_InMessage =
    | OffRamp_Commit
    | OffRamp_Execute
    | OffRamp_ExecuteValidated
    | OffRamp_ManuallyExecute
    | OffRamp_DispatchValidated
    | OffRamp_UpdateSourceChainConfig
    | OffRamp_CCIPReceiveConfirm
    | OffRamp_CCIPReceiveBounced
    | OffRamp_NotifyFailure
    | OffRamp_NotifySuccess
    | OffRamp_NotifyFailure
    | OCR3Base_SetOCR3Config
    | OffRamp_UpdateCursedSubjects
    | Upgradeable_Upgrade
    | Withdrawable_Withdraw;

//crc32('OffRamp_Commit')
struct (0x9d431905) OffRamp_Commit {
    queryId: uint64;
    reportContext: ReportContext;
    report: CommitReport;
    signatures: SnakedCell<SignatureEd25519>;
}

//crc32('OffRamp_Execute')
struct (0x27bdac33) OffRamp_Execute {
    queryId: uint64;
    reportContext: ReportContext;
    report: ExecutionReport;
}

//crc32('OffRamp_ExecuteValidated')
struct (0xc73d5a8a) OffRamp_ExecuteValidated {
    message: Cell<Any2TVMRampMessage>;
    root: MerkleRootId;
    metadataHash: uint256;
}

//crc32('OffRamp_ManuallyExecute')
struct (0xa00785cf) OffRamp_ManuallyExecute {
    queryId: uint64;
    report: ExecutionReport;
    gasOverride: coins; // TODO: should this just be part of the added gas value passed into the call?
}

//Must be sent by owner
//crc32('OffRamp_UpdateSourceChainConfig')
struct (0xb98c95e3) OffRamp_UpdateSourceChainConfig {
    queryId: uint64;
    sourceChainSelector: uint64;
    config: SourceChainConfig;
}

//Must be sent from an owned ReceiveExecutor contract
//crc32('OffRamp_DispatchValidated')
struct (0x58cfcb02) OffRamp_DispatchValidated { 
    message: Cell<Any2TVMRampMessage>;
    execId: uint192;
}

//crc32('OffRamp_CCIPReceiveConfirm')
struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
    execId: ReceiveExecutorId;
    receiver: address;
}

//crc32("OffRamp_CCIPReceiveBounced")
struct (0x2dcf2a43) OffRamp_CCIPReceiveBounced {
    execId: ReceiveExecutorId;
    receiver: address;
}

//crc32('OffRamp_NotifySuccess')
struct (0x59e56170) OffRamp_NotifySuccess {
    header: RampMessageHeader;
    execId: ReceiveExecutorId;
    root: address;
}

//crc32('OffRamp_NotifyFailure')
struct (0x177ebd03) OffRamp_NotifyFailure {
    header: RampMessageHeader;
    execId: ReceiveExecutorId;
    root: address;
}

//crc32('OffRamp_UpdateCursedSubjects')
struct (0x4ca1bcb3) OffRamp_UpdateCursedSubjects {
    cursedSubjects: CursedSubjects
}
