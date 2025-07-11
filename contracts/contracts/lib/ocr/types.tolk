import "./../utils.tolk";
import "./exit_codes.tolk";

// Maximum number of oracles the offchain reporting protocol is designed for
const MAX_NUM_ORACLES: int = 255;

const OCR_PLUGIN_TYPE_COMMIT: int = 0;
const OCR_PLUGIN_TYPE_EXECUTE: int = 1;

struct OCR3Base {
	chainId: uint8;
	commit: Cell<Config>?;
	execute: Cell<Config>?;
}

fun newOCR3BaseState(chainId: int): OCR3Base {
	return OCR3Base {
		chainId: chainId,
		commit: newOCRConfig().toCell(),
		execute: newOCRConfig().toCell()
	};
}

fun OCR3Base.getConfig(self, ocrPluginType: uint16): Config? {
	if (ocrPluginType == OCR_PLUGIN_TYPE_COMMIT) {
		if (self.commit == null) {
			return null;
		}
		return self.commit!.load();

	} else if (ocrPluginType == OCR_PLUGIN_TYPE_EXECUTE) {
		if (self.execute == null) {
			return null;
		}
		return self.execute!.load();
	} else {
		throw ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE;
	}
}

struct Config {
	configInfo: ConfigInfo;
	signers: UMap<uint256, uint8>;
	transmitters: Map<uint8>;
}

fun newOCRConfig(): Config {
	return Config {
		configInfo: newConfigInfo(),
		signers: UMap<uint256, uint8>.new(256),
		transmitters: Map<uint8>.new()
	}
}


fun Config.assignSignerOracles(
	mutate self,
	signers: cell /*Vector<uint256>*/
) {
	// TODO: We cannot do ed25519 public key validation on chain. For now we assume valid keys.
	var signersDict = UMap<uint256, uint8>.new(256);
	var signersIt = Iterator<uint256>.new(signers);
	var i = 0;
	while (!signersIt.empty()) {
		val signer = signersIt.next();
		assert(!signersDict.has(signer), ERROR_REPEATED_SIGNERS);
		i = i + 1;
		signersDict.set(
			signer,
			i
		);
	}
	self.signers = signersDict;
}

fun Config.assignTransmitterOracles(
	mutate self,
	transmitters: cell, //Vector<address>
) {
	var transmittersDict = Map<uint8>.new(); 
	var transmittersIt = Iterator<address>.new(transmitters);
	var i = 0;
	while (!transmittersIt.empty()) {
		val transmitter = transmittersIt.next();
		assert(!transmittersDict.has(transmitter), ERROR_REPEATED_TRANSMITTERS);
		i = i + 1;
		transmittersDict.set(
			transmitter,
			i
		);
	}
	self.transmitters = transmittersDict;
}

struct ConfigInfo {
	configDigest: uint256 = 0;
	bigF: uint8 = 0;
	n: uint8 = 0;
	isSignatureVerificationEnabled: bool = false;
}

fun newConfigInfo(): ConfigInfo {
	return ConfigInfo {
		configDigest: 0,
		bigF: 0,
		n: 0,
		isSignatureVerificationEnabled: false
	};
}

struct SignatureEd25519 {
	r: uint256;
	s: uint256;
	signer: uint256
}

// TODO replace with cell?
struct ReportContext {
	configDigest: uint256;
	sequenceBytes: uint64
}
