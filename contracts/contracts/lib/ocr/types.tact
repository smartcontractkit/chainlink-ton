import "../shared/array.tact";

// Maximum number of oracles the offchain reporting protocol is designed for
const MAX_NUM_ORACLES: Int = 255;

const OCR_PLUGIN_TYPE_COMMIT: Int = 0;
const OCR_PLUGIN_TYPE_EXECUTION: Int = 1;


struct OCR3BaseState {
	chainId: Int as uint8;
	// ocr plugin type -> ocr config
	ocr3Configs: map<Int, OCRConfig>;
        // ocr plugin type -> signers
	signerOracles: map<Int, ArrayUint256>;
	// ocr plugin type -> transmitters
	transmitterOracles: map<Int, ArrayAddress>;
}

struct OCRConfig {
	configInfo: ConfigInfo;
	signers: ArrayUint256;
	transmitters: ArrayAddress;
}

fun newOCRConfig(): OCRConfig {
	return OCRConfig {
		configInfo: newConfigInfo(),
		signers: newArrayUint256(),
		transmitters: newArrayAddress()
	}

}

struct ConfigInfo {
	configDigest: Int as uint256;
	bigF: Int as uint8;
	n: Int as uint8;
	isSignatureVerificationEnabled: Bool;
}

fun newConfigInfo(): ConfigInfo {
	return ConfigInfo {
		configDigest: 0,
		bigF: 0,
		n: 0,
		isSignatureVerificationEnabled: false
	};
}

struct Oracle {
	index: Int as uint8;
	role: Int as uint8;
} 


fun newOCR3BaseState(chainId: Int): OCR3BaseState {
	return OCR3BaseState {
		chainId: chainId,
		ocr3Configs: emptyMap(),
		signerOracles: emptyMap(),
		transmitterOracles: emptyMap()
	};
}



