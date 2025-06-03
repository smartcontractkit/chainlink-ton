import "../access/ownable_2step.tact";
import "../upgrades/type_and_version.tact";
import "../shared/array.tact";
import "./types.tact";
import "./exit_codes.tact";

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
	configDigest: Int as uint256;
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
		throwUnless(ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE, msg.ocrPluginType == OCR_PLUGIN_TYPE_COMMIT || msg.ocrPluginType == OCR_PLUGIN_TYPE_EXECUTION);

		//self.requireOwner();
		throwUnless(ERROR_BIG_F_MUST_BE_POSITIVE, msg.bigF > 0);

		let option = self.ocr3BaseState.ocr3Configs.get(msg.ocrPluginType);
		if (option == null) {
			self.ocr3BaseState.ocr3Configs.set(msg.ocrPluginType, newOCRConfig());
		} 

		let ocrConfig = self.ocr3BaseState.ocr3Configs.get(msg.ocrPluginType)!!;

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
			throwUnless(ERROR_TOO_MANY_SIGNERS, msg.signers.length <= MAX_NUM_ORACLES);
			throwUnless(ERROR_BIG_F_TOO_HIGH, msg.signers.length > 3 * msg.bigF);
			throwUnless(ERROR_TOO_MANY_TRANSMITTERS, msg.signers.length >= msg.transmitters.length);

			ocrConfig.configInfo.n = msg.signers.length ;
			ocrConfig.signers = msg.signers;
			self.assignSignerOracles(msg.ocrPluginType, msg.signers);
		}
		ocrConfig.transmitters = msg.transmitters;

		self.assignTransmitterOracles(
			msg.ocrPluginType,
			msg.transmitters
		);

		ocrConfig.configInfo.bigF = msg.bigF;
		ocrConfig.configInfo.configDigest = msg.configDigest;
		
		emit(ConfigSet {
			ocrPluginType: msg.ocrPluginType,
			configDigest: ocrConfig.configInfo.configDigest,
			signers: ocrConfig.signers,
			transmitters: ocrConfig.transmitters,
			bigF: ocrConfig.configInfo.bigF
		}.toCell());
	}

	fun assignSignerOracles(ocrPluginType: Int, signers: ArrayUint256) {
		throwUnless(ERROR_REPEATED_SIGNERS, !signers.hasDuplicates());
		// TODO: We cannot do ed25519 public key validation on chain. For now we assume valid keys.
		self.ocr3BaseState.signerOracles.set(
			ocrPluginType,
			signers
		);
	}

	fun assignTransmitterOracles(ocrPluginType: Int, transmitters: ArrayAddress) {
		throwUnless(ERROR_REPEATED_TRANSMITTERS, !transmitters.hasDuplicates());
		self.ocr3BaseState.transmitterOracles.set(
			ocrPluginType,
			transmitters
		);
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

