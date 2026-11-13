// SPDX-License-Identifier: BUSL-1.1
import "../../lib/ocr/multi_ocr3_base"
import "../../lib/access/ownable_2step"
import "types"
import "../rmn_remote/lib"

struct (0xbfbdf63f) OffRamp_Storage_V1_7_0 {
    id: uint32;
    ownable: Ownable2Step;
    // Static and dynamic config are combined into a single cell reference to
    // stay within the TVM 4-ref serialization limit for the root Storage struct.
    config: Cell<OffRamp_StorageConfig>;
    ocr3Base: Cell<OCR3Base>
    cursedSubjects: CursedSubjects;

    sourceChainConfigs: map<uint64, SourceChainConfig> = [];

    // This is the OCR sequence number, not to be confused with the CCIP message sequence number.
    latestPriceSequenceNumber: uint64 = 0;
}

fun OffRamp_Storage_V1_7_0.load(): OffRamp_Storage_V1_7_0 {
    return OffRamp_Storage_V1_7_0.fromCell(contract.getData());
}

fun OffRamp_Storage_V1_7_0.store(self) {
    return contract.setData(self.toCell());
}
