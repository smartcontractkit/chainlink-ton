import "../lib/ocr/multi_ocr3_base";
import "../lib/ocr/types";

contract MultiOCR3BaseExample with MultiOCR3Base {
    ocr3BaseState: OCR3BaseState;

    init() {
        // Initialize the OCR3BaseState with a chain ID, e.g., 1337.
        self.ocr3BaseState = newOCR3BaseState(1);
    }

    receive() {}
}
