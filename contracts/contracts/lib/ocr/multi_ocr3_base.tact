import "../access/ownable_2step.tact";
import "../upgrades/type_and_version.tact";
import "../../shared/array.tact";

const ERROR_BIG_F_MUST_BE_POSITIVE: Int = 1000;
const ERROR_STATIC_CONFIG_CANNOT_BE_CHANGED: Int = 1001;
const ERROR_TOO_MANY_SIGNERS: Int = 1002;
const ERROR_BIG_F_TOO_HIGH: Int = 1003;
const ERROR_TOO_MANY_TRANSMITTERS: Int = 1004;
const ERROR_NO_TRANSMITTERS: Int = 1005;
const ERROR_REPEATED_SIGNERS: Int = 1006;
const ERROR_REPEATED_TRANSMITTERS: Int = 1007;
const ERROR_FORKED_CHAIN: Int = 1008;
const ERROR_CONFIG_DIGEST_MISMATCH: Int = 1009;
const ERROR_UNAUTHORIZED_TRANSMITTER: Int = 1010;
const ERROR_WRONG_NUMBER_OF_SIGNATURES: Int = 1011;
const ERROR_COULD_NOT_VALIDATE_SIGNER_KEY: Int = 1012;
const ERROR_INVALID_REPORT_CONTEXT_LENGTH: Int = 1013;
const ERROR_INVALID_CONFIG_DIGEST_LENGTH: Int = 1014;
const ERROR_INVALID_SEQUENCE_LENGTH: Int = 1015;
const ERROR_UNAUTHORIZED_SIGNER: Int = 1016;
const ERROR_NON_UNIQUE_SIGNATURES: Int = 1017;
const ERROR_INVALID_SIGNATURE: Int = 1018;

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


/// @notice Event, triggers a new run of the offchain reporting protocol.
/// @param ocrPluginType OCR plugin type for which the config was set.
/// @param configDigest configDigest of this configuration.
/// @param signers ith element is address ith oracle uses to sign a report.
/// @param transmitters ith element is address ith oracle uses to transmit a report via the transmit method.
/// @param F maximum number of faulty/dishonest oracles the protocol can tolerate while still working correctly.
message ConfigSet {
	ocrPluginType: Int as uint8;
	configDigest: Int as uint256;
	signers: ArrayUint256;
	transmitters: ArrayAddress;
	bigF: Int as uint8;
}


/// @notice Event, optionally emitted to indicate the latest configDigest and sequence number
/// for which a report was successfully transmitted. Alternatively, the contract may
/// use latestConfigDigestAndEpoch with scanLogs set to false.
message Transmitted {
	ocrPluginType: Int as uint8;
	configDigest: Int as uint256;
	sequenceNumber: Int as uint64
}
message Transmit{
	
}

message SetOCR3Config{
	configDiges: Int as uint256;
	ocrPluginType: Int as uint8;
	bigF: Int as uint8;
	isSignatureVerificationEnabled: Bool;
	signers: ArrayUint256;
	transmitters: ArrayAddress;
}

/// @notice Onchain verification of reports from the offchain reporting protocol with multiple OCR plugin support.
trait MultiOCR3Base {
	//Required storage variables.
	ocr3BaseState: OCR3BaseState;

	receive(msg: SetOCR3Config) {
		//self.requireOwner();
		throwUnless(ERROR_BIG_F_MUST_BE_POSITIVE, msg.bigF > 0);

		let ocrConfig = newOCRConfig();

		let option = self.ocr3BaseState.ocr3Configs.get(msg.ocrPluginType);
		if (option != null) {
			ocrConfig = option!!
		}

		// If F is 0, then the config is not yet set.
		if ocrConfig.configInfo.bigF == 0 {
			ocrConfig.configInfo.isSignatureVerificationEnabled = msg.isSignatureVerificationEnabled;
		} else {
			throwUnless(
				ERROR_STATIC_CONFIG_CANNOT_BE_CHANGED,
				ocrConfig.configInfo.isSignatureVerificationEnabled == msg.isSignatureVerificationEnabled
			);
		}

		throwUnless(ERROR_TOO_MANY_TRANSMITTERS, msg.transmitters.length <= MAX_NUM_ORACLES);
		throwUnless(ERROR_NO_TRANSMITTERS, msg.transmitters.length > 0);
		
		if (msg.isSignatureVerificationEnabled) {
/*

            // NOTE: Transmitters cannot exceed signers. Transmitters do not have to be >= 3F + 1 because they can
            // match >= 3fChain + 1, where fChain <= F. fChain is not represented in MultiOCR3Base - so we skip this check.
            assign_signer_oracles(
                &mut ocr3_state.signer_oracles, ocr_plugin_type, &signers
            );
*/
			throwUnless(ERROR_TOO_MANY_SIGNERS, msg.signers.length <= MAX_NUM_ORACLES);
			throwUnless(ERROR_BIG_F_TOO_HIGH, msg.signers.length > 3 * msg.bigF);
			throwUnless(ERROR_TOO_MANY_TRANSMITTERS, msg.signers.length >= msg.transmitters.length);

			ocrConfig.configInfo.n = msg.signers.length ;
			ocrConfig.signers = msg.signers;
			assignSignerOracles(ocrPluginType, msg.signers);
		}
	}

	fun assignSignerOracles(ocrPluginType: Int, signers: ArrayUint256) {
		throwUnless(ERROR_REPEATED_SIGNERS, !hasDuplicates(signers));

	}


	/*
        signer_oracles: &mut Table<u8, vector<ed25519::UnvalidatedPublicKey>>,
        ocr_plugin_type: u8,
        signers: &vector<vector<u8>>
    ) {
        assert!(!has_duplicates(signers), error::invalid_argument(E_REPEATED_SIGNERS));

        let validated_signers =
            signers.map_ref(|signer| {
                let maybe_validated_public_key =
                    ed25519::new_validated_public_key_from_bytes(*signer);
                assert!(
                    maybe_validated_public_key.is_some(),
                    error::invalid_argument(E_COULD_NOT_VALIDATE_SIGNER_KEY)
                );
                ed25519::public_key_into_unvalidated(maybe_validated_public_key.extract())
            });

        signer_oracles.upsert(ocr_plugin_type, validated_signers);
    }
	receive(msg: Transmit){
		
	}
	*/
}

