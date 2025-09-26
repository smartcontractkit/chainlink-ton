import "./../utils.tolk";
import "./exit_codes.tolk";

// Maximum number of oracles the offchain reporting protocol is designed for
const MAX_NUM_ORACLES: int = 255;

const OCR_PLUGIN_TYPE_COMMIT: int = 0;
const OCR_PLUGIN_TYPE_EXECUTE: int = 1;


struct OCRConfig {
	configInfo: ConfigInfo;
	signers: map<uint256, uint8>;
	transmitters: map<address, uint8>;
}

fun newOCRConfig(): OCRConfig {
	return OCRConfig {
		configInfo: ConfigInfo{},
		signers: createEmptyMap(),
		transmitters: createEmptyMap()
	}
}


fun OCRConfig.assignSignerOracles(
	mutate self,
	signers: cell /*Vector<uint256>*/
) {
	// TODO: Right now we cannot do ed25519 public key validation on chain. For now we assume valid keys.
	var signersMap= createEmptyMap<uint256, uint8>();
	var signersIt = Iterator<uint256>.new(signers);
	var i = 0;
	while (!signersIt.empty()) {
		val signer = signersIt.next();
		assert(!signersMap.get(signer).isFound, ERROR_REPEATED_SIGNERS);
		i = i + 1;
		signersMap.set(
			signer,
			i
		);
	}
	self.signers = signersMap;
}

fun OCRConfig.assignTransmitterOracles(
	mutate self,
	transmitters: cell, //Vector<address>
) {
	var transmittersMap = createEmptyMap<address, uint8>(); 
	var transmittersIt = Iterator<address>.new(transmitters);
	var i = 0;
	while (!transmittersIt.empty()) {
		val transmitter = transmittersIt.next();
		assert(!transmittersMap.get(transmitter).isFound, ERROR_REPEATED_TRANSMITTERS);
		i = i + 1;
		transmittersMap.set(
			transmitter,
			i
		);
	}
	self.transmitters = transmittersMap;
}

struct ConfigInfo {
	configDigest: uint256 = 0;
	bigF: uint8 = 0;
	n: uint8 = 0;
	isSignatureVerificationEnabled: bool = false;
}

struct SignatureEd25519 {
	signer: uint256
	r: uint256;
	s: uint256;
}

struct ReportContext {
	configDigest: uint256;
	_padding: bytes24;
	sequenceBytes: uint64
}
