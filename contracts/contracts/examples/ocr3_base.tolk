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
    ocrPluginType: uint16,
    reportContext: ReportContext,
    report: cell,
    signatures: cell, //Vector<SignatureEd25519>
}

// Support the SetOCR3Config message from multi_ocr3_base.tolk
type IncomingMessage = Transmit | OCR3Base_SetOCR3Config;

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs = msgFull.beginParse();
    var flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);
    match (msg) {
        Transmit => {
        //Using the transmit function validates signatures and emits an event
            var storage = loadData();
            storage.OCR3Base.transmit(
                msg.transmitter,
                msg.ocrPluginType,
                msg.reportContext,
                msg.report,
                msg.signatures
            );
        },
        //The SetOCR3Config message configures authorized signers and transmitters
        OCR3Base_SetOCR3Config => {
            var storage = loadData();
            storage.OCR3Base.setOcr3Config(msg);
            saveData(storage);
        }
     }
}
