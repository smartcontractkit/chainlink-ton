import "./../lib/ocr/multi_ocr3_base.tolk";
import "./../lib/ocr/types.tolk";
import "./../lib/utils.tolk";

struct OCR3BaseExampleContract {
    OCR3Base: OCR3Base;
}

fun loadData(): OCR3BaseExampleContract {
    return OCR3BaseExampleContract.fromCell(contract.getData());
}

fun saveData(data: OCR3BaseExampleContract) {
    contract.setData(data.toCell());
}

struct (0x00000001) Transmit {
    transmitter: address, //TODO: might have to use the sender address for testing here
    ocrPluginType: int,
    reportContext: ReportContext,
    report: cell,
    signatures: cell, //Iterator<uint256>
}

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var storage = loadData();
    
        // Try to handle ocr3_base trait messages first
    var handled = storage.OCR3Base.onInternalMessage(myBalance, msgValue, msgFull, msgBody);

    if (handled) {
        // Store updates and return
        saveData(storage);
        return;
    }

    val msg = Transmit.fromSlice(msgBody);

    storage.OCR3Base.transmit(
        msg.transmitter,
        msg.ocrPluginType,
        msg.reportContext,
        msg.report,
        msg.signatures
    );
}
