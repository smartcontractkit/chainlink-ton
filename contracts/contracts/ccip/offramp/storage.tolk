import "../../lib/ocr/multi_ocr3_base"
import "../../lib/access/ownable_2step"
import "types"

struct Storage {
    id: uint32;
    ownable: Ownable2Step;
    deployer: cell; // Deployable compiled code
    merkleRootCode: cell; // make sure to use a library cell offchain to save space
    feeQuoter: address;
    ocr3Base: Cell<OCR3Base>

    // static config
    chainSelector: uint64;

    // dynamic config
    permissionlessExecutionThresholdSeconds: uint32,

    sourceChainConfigs: map<uint64, SourceChainConfig>;

    // This is the OCR sequence number, not to be confused with the CCIP message sequence number.
    latestPriceSequenceNumber: uint64;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}


