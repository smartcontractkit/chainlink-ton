import "./../utils.tolk";

// Maximum number of oracles the offchain reporting protocol is designed for
const MAX_NUM_ORACLES: int = 255;

const OCR_PLUGIN_TYPE_COMMIT: int = 0;
const OCR_PLUGIN_TYPE_EXECUTION: int = 1;

struct OCR3Base {
	chainId: uint8;
	// ocr plugin type -> ocr config
	ocr3Configs: UMap<uint16, OCRConfig>;
        // ocr plugin type -> signers
	signerOracles: UMap<uint16, cell>; //Iterator<uint256>
	// ocr plugin type -> transmitters
	transmitterOracles: UMap<uint16,cell>; //Iterator<address>
}

fun newOCR3BaseState(chainId: int): OCR3Base {
	return OCR3Base {
		chainId: chainId,
		ocr3Configs: UMap<uint16, OCRConfig>.new(16),
		signerOracles: UMap<uint16, cell>.new(16),
		transmitterOracles: UMap<uint16, cell>.new(16)
	};
}

struct OCRConfig {
	configInfo: ConfigInfo;
	signers: cell; //Iterator<uint256>
	transmitters: cell; //Iterator<address>
}

fun newOCRConfig(): OCRConfig {
	return OCRConfig {
		configInfo: newConfigInfo(),
		signers: beginCell().endCell(),
		transmitters: beginCell().endCell()
	}
}

struct ConfigInfo {
	configDigest: uint256;
	bigF: uint8;
	n: uint8;
	isSignatureVerificationEnabled: bool;
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
	index: uint8;
	role: uint8;
} 

struct SignatureEd25519 {
	r: uint256;
	s: uint256
}

struct ReportContext {
	configDigest: uint256;
	//Should be a uint64 with 24 bytes of padding
	sequenceBytes: uint64
}
