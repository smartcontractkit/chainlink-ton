import "types"
import "../../lib/ocr/types.tolk"
import "../../lib/ocr/multi_ocr3_base.tolk"
import "../../lib/receiver/messages.tolk"
import "../common/types.tolk"
import "../../lib/utils"

type OffRamp_InMessage =
    | OffRamp_Commit
    | OffRamp_Execute
    | OffRamp_DispatchValidated
    | OffRamp_UpdateSourceChainConfig
    | OCR3Base_SetOCR3Config
    | OffRamp_CCIPReceiveConfirm
    | OffRamp_NotifyFailure
    | OffRamp_NotifySuccess;

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

//crc32('OffRamp_UpdateSourceChainConfig')
struct (0xb98c95e3) OffRamp_UpdateSourceChainConfig {
    queryId: uint64;
    sourceChainSelector: uint64;
    config: SourceChainConfig;
}

//Must be sent from an owned MerkleRoot contract
//crc32('OffRamp_DispatchValidated')
struct (0x58cfcb02) OffRamp_DispatchValidated { 
    message: Cell<Any2TVMRampMessage>;
    rootId: uint224;
}

//crc32('OffRamp_CCIPReceiveConfirm')
struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
    rootId: uint224;
}

//crc32('OffRamp_NotifySuccess')
struct (0x23232323) OffRamp_NotifySuccess {
    header: RampMessageHeader;
    rootId: uint224;
}

//crc32('OffRamp_NotifyFailure')
struct(0x177ebd03) OffRamp_NotifyFailure {
    header: RampMessageHeader;
    rootId: uint224;
}

//crc32('OffRamp_NotifyInProgress')
struct (0xdc81855a) OffRamp_NotifyInProgress {
    message: Any2TVMRampMessage; // vec<Any2TVMRampMessage>
    rootId: uint224;
}
