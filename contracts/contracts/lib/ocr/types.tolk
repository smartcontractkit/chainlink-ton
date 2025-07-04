import "./../utils.tolk";

// Maximum number of oracles the offchain reporting protocol is designed for
const MAX_NUM_ORACLES: int = 255;

const OCR_PLUGIN_TYPE_COMMIT: int = 0;
const OCR_PLUGIN_TYPE_EXECUTION: int = 1;

struct OCR3Base {
	chainId: uint8;
	// ocr plugin type -> ocr config
	ocr3Configs: UMap<uint16, OCRConfig>;
        // ocr plugin type -> Vector<signer>
	signerOracles: UMap<uint16, cell>; 
	// ocr plugin type -> <transmitter -> index> // stored as dict for quick inclusion check
	transmitterOracles: UMap<uint16,Map<uint16>>; 
}

fun newOCR3BaseState(chainId: int): OCR3Base {
	return OCR3Base {
		chainId: chainId,
		ocr3Configs: UMap<uint16, OCRConfig>.new(16),
		signerOracles: UMap<uint16, cell>.new(16),
		transmitterOracles: UMap<uint16, Map<uint16>>.new(16)
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

// TODO It would be more efficient to store 3 hashes per cell, pretty awkward though
struct SignatureEd25519 {
	r: uint256;
	s: uint256
}

// TODO replace with cell?
struct ReportContext {
	configDigest: uint256;
	sequenceBytes: uint64
}
