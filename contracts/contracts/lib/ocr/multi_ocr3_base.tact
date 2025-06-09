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

/// @notice Sets offchain reporting protocol configuration incl. participating oracles.
/// NOTE: The OCR3 config must be sanity-checked against the home-chain registry configuration, to ensure home-chain
/// and remote-chain parity!
/// @param ocrConfigArgs OCR config update args.
/// @dev precondition number of transmitters should match the expected F/fChain relationship.
/// For transmitters, the function only validates that len(transmitters) > 0 && len(transmitters) <= MAX_NUM_ORACLES
/// && len(transmitters) <= len(signers) [if sig verification is enabled].
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
		
		self.ocr3BaseState.ocr3Configs.set(
			msg.ocrPluginType,
			ocrConfig
		);

		emit(ConfigSet {
			ocrPluginType: msg.ocrPluginType,
			configDigest: ocrConfig.configInfo.configDigest,
			signers: ocrConfig.signers,
			transmitters: ocrConfig.transmitters,
			bigF: ocrConfig.configInfo.bigF
		}.toCell());
	}

	fun transmit(
		transmitter: Address,
		ocrPluginType: Int,
		reportContext: ReportContext,
		report: Slice,
		signatures: ArrayCells,
        ) { 
		let ocrConfigOption = self.ocr3BaseState.ocr3Configs.get(ocrPluginType);
		throwUnless(ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE, ocrConfigOption != null);
		let ocrConfig = ocrConfigOption!!;
		let configInfo: ConfigInfo = ocrConfig.configInfo;

		// TODO: EVM checks transaction data length here

		throwUnless(ERROR_CONFIG_DIGEST_MISMATCH, reportContext.configDigest == configInfo.configDigest);

		// TODO assert_chain_not_forked, not sure how to do this check or if it's even necessary in TON

		let pluginTransmitters = self.ocr3BaseState.transmitterOracles.get(ocrPluginType);
		throwUnless(ERROR_UNAUTHORIZED_TRANSMITTER, pluginTransmitters != null && pluginTransmitters!!.has(transmitter));


		if (configInfo.isSignatureVerificationEnabled) {
			let expectedSignatures = configInfo.bigF + 1;
			throwUnless(ERROR_WRONG_NUMBER_OF_SIGNATURES, signatures.length == expectedSignatures);
			let hashedReport = self.hashReport(report, reportContext);
			let pluginSigners = self.ocr3BaseState.signerOracles.get(ocrPluginType);
			throwUnless(ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE, pluginSigners != null);
			self.verifySignature(pluginSigners!!, hashedReport, signatures);
		}
		emit(Transmitted {
			ocrPluginType: ocrPluginType,
			configDigest: reportContext.configDigest,
			sequenceNumber: reportContext.sequenceBytes
		}.toCell());
	}

	fun hashReport(report: Slice, reportContext: ReportContext): Int {
		let data = beginCell().storeSlice(report)
			.storeUint(reportContext.configDigest, 256)
			.storeUint(0, 192) // Padding to 256 bits
			.storeUint(reportContext.sequenceBytes, 64)
			.asSlice();
		return sha256(data);
	}

	fun verifySignature(
		signers: ArrayUint256,
		hashedReport: Int,
		signatures: ArrayCells
	) {
		let i = 0;
		while (i < signatures.length) {
			let signature = signatures.get(i).asSlice();
			let signerKey = signers.get(i);
			throwUnless(ERROR_INVALID_SIGNATURE, checkSignature(hashedReport, signature, signerKey));
		}
	}

	inline fun assignSignerOracles(ocrPluginType: Int, signers: ArrayUint256) {
		throwUnless(ERROR_REPEATED_SIGNERS, !signers.hasDuplicates());
		// TODO: We cannot do ed25519 public key validation on chain. For now we assume valid keys.
		self.ocr3BaseState.signerOracles.set(
			ocrPluginType,
			signers
		);
	}

	inline fun assignTransmitterOracles(ocrPluginType: Int, transmitters: ArrayAddress) {
		throwUnless(ERROR_REPEATED_TRANSMITTERS, !transmitters.hasDuplicates());
		self.ocr3BaseState.transmitterOracles.set(
			ocrPluginType,
			transmitters
		);
	}
}

