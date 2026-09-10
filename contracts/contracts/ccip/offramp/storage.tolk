// SPDX-License-Identifier: BUSL-1.1
import "../../lib/ocr/multi_ocr3_base"
import "../../lib/access/ownable_2step"
import "types"
import "../rmn_remote/lib"

struct Storage {
    id: uint32;
    ownable: Ownable2Step;
    config: Cell<OffRamp_Config>;
    ocr3Base: Cell<OCR3Base>
    cursedSubjects: CursedSubjects;

    // static config
    chainSelector: uint64;

    sourceChainConfigs: map<uint64, SourceChainConfig> = [];

    // This is the OCR sequence number, not to be confused with the CCIP message sequence number.
    latestPriceSequenceNumber: uint64 = 0;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
