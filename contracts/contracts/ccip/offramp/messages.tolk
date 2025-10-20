import "types"
import "../../lib/ocr/types.tolk"
import "../../lib/ocr/multi_ocr3_base.tolk"
import "../../lib/receiver/messages.tolk"
import "../common/types.tolk"
import "../../lib/utils"

type OffRamp_InMessage =
    | OffRamp_Commit
    | OffRamp_Execute
    | OffRamp_ExecuteValidated
    | OffRamp_DispatchValidated
    | OffRamp_UpdateSourceChainConfig
    | OCR3Base_SetOCR3Config
    | OffRamp_CCIPReceiveConfirm
    | OffRamp_NotifySuccess
    | OffRamp_NotifyFailure;

type OffRamp_BouncedMessage =  Receiver_CCIPReceive;

//crc32('OffRamp_Commit')
struct (0x9d431905) OffRamp_Commit {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: ReportContext;
    report: CommitReport;
    signatures: SnakedCell<SignatureEd25519>;
}

//crc32('OffRamp_Execute')
struct (0x27bdac33) OffRamp_Execute {
    queryId: uint64;
    // TODO: could just store as one slice since context is fixed size
    reportContext: ReportContext;
    report: ExecutionReport;
}

//TODO crc32 etc
struct (0x13241224) OffRamp_ExecuteValidated {
    message: Cell<Any2TVMRampMessage>;
    root: uint256;
    metadataHash: uint256;
}

struct(0xabcdef01) OffRamp_MessageReadyForDispatch {
    message: Any2TVMRampMessage;
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
    execId: uint224;
}

//crc32('OffRamp_CCIPReceiveConfirm')
struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
    execId: uint224;
}

//TODO crc32('OffRamp_NotifySuccess')
struct (0x23232323) OffRamp_NotifySuccess {
    header: RampMessageHeader;
    execId: uint224;
}

//TODO crc32('OffRamp_NotifyFailure')
struct (0x33533353) OffRamp_NotifyFailure {
    header: RampMessageHeader;
    execId: uint224;
}
